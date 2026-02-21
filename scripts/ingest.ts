#!/usr/bin/env tsx
/**
 * Egyptian Law MCP -- Real ingestion pipeline.
 *
 * Source portal:
 *   https://portal.investment.gov.eg/publiclaws
 *
 * Strategy:
 * 1. Discover law detail pages from official categories.
 * 2. Fetch law metadata and official PDF attachment.
 * 3. Extract text via pdftotext and parse article-level provisions.
 * 4. Write seed JSON files under data/seed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { fetchBinaryWithRateLimit, fetchTextWithRateLimit, resolveUrl } from './lib/fetcher.js';
import {
  buildSeedFromPdfText,
  extractLawIdsFromCategoryHtml,
  parseLawDetailHtml,
  selectPrimaryAttachment,
  type ParsedAct,
} from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

const PORTAL_BASE_URL = 'https://portal.investment.gov.eg';
const LAW_CATEGORIES = [16, 17];

interface CliArgs {
  limit: number | null;
  skipFetch: boolean;
}

interface IngestResult {
  lawId: number;
  docId?: string;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  provisions?: number;
  definitions?: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
}

function ensureDirs(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function clearOldSeeds(): void {
  for (const file of fs.readdirSync(SEED_DIR)) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(SEED_DIR, file));
    }
  }
}

function categoryUrl(categoryId: number): string {
  return `${PORTAL_BASE_URL}/publiclaws/category/${categoryId}`;
}

function detailUrl(lawId: number): string {
  return `${PORTAL_BASE_URL}/publiclaws/details/${lawId}`;
}

function extractPdfText(pdfPath: string): string {
  const result = spawnSync('pdftotext', ['-layout', pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`pdftotext failed (${result.status}): ${result.stderr || 'unknown error'}`);
  }

  return result.stdout;
}

function hasMeaningfulText(text: string): boolean {
  return text.replace(/\s+/g, '').length > 100;
}

async function loadCategoryLawIds(skipFetch: boolean): Promise<number[]> {
  const ids = new Set<number>();

  for (const categoryId of LAW_CATEGORIES) {
    const url = categoryUrl(categoryId);
    const cachePath = path.join(SOURCE_DIR, `category-${categoryId}.html`);

    let html: string;
    if (skipFetch && fs.existsSync(cachePath)) {
      html = fs.readFileSync(cachePath, 'utf-8');
    } else {
      const response = await fetchTextWithRateLimit(url);
      if (response.status !== 200) {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
      }
      html = response.body;
      fs.writeFileSync(cachePath, html, 'utf-8');
    }

    for (const lawId of extractLawIdsFromCategoryHtml(html)) {
      ids.add(lawId);
    }
  }

  return [...ids].sort((a, b) => a - b);
}

async function processLaw(lawId: number, skipFetch: boolean): Promise<IngestResult> {
  const detailCachePath = path.join(SOURCE_DIR, `law-${lawId}.html`);

  let html: string;
  if (skipFetch && fs.existsSync(detailCachePath)) {
    html = fs.readFileSync(detailCachePath, 'utf-8');
  } else {
    const detailResponse = await fetchTextWithRateLimit(detailUrl(lawId));
    if (detailResponse.status !== 200) {
      return { lawId, status: 'error', reason: `detail HTTP ${detailResponse.status}` };
    }
    html = detailResponse.body;
    fs.writeFileSync(detailCachePath, html, 'utf-8');
  }

  const law = parseLawDetailHtml(html, detailUrl(lawId));
  if (!law) {
    return { lawId, status: 'skipped', reason: 'unable to parse law metadata' };
  }

  const attachment = selectPrimaryAttachment(law.attachments);
  if (!attachment) {
    return { lawId, status: 'skipped', reason: 'no downloadable PDF attachment' };
  }

  const pdfUrl = resolveUrl(PORTAL_BASE_URL, attachment.href);
  const downloadId = attachment.href.match(/\/(\d+)$/)?.[1] ?? 'unknown';
  const pdfPath = path.join(SOURCE_DIR, `law-${lawId}-download-${downloadId}.pdf`);
  const textPath = path.join(SOURCE_DIR, `law-${lawId}-download-${downloadId}.txt`);

  if (!(skipFetch && fs.existsSync(pdfPath))) {
    const pdfResponse = await fetchBinaryWithRateLimit(pdfUrl);
    if (pdfResponse.status !== 200) {
      return { lawId, status: 'error', reason: `pdf HTTP ${pdfResponse.status}` };
    }
    fs.writeFileSync(pdfPath, pdfResponse.body);
  }

  const pdfText = extractPdfText(pdfPath);
  fs.writeFileSync(textPath, pdfText, 'utf-8');

  if (!hasMeaningfulText(pdfText)) {
    return {
      lawId,
      status: 'skipped',
      reason: 'PDF text is empty/image-only (no extractable machine text)',
    };
  }

  const seed = buildSeedFromPdfText(law, pdfText, pdfUrl);
  if (!seed) {
    return {
      lawId,
      status: 'skipped',
      reason: 'no parseable article sections (مادة/Article) found in extracted text',
    };
  }

  const seedPath = path.join(SEED_DIR, `${seed.id}.json`);
  fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));

  return {
    lawId,
    docId: seed.id,
    status: 'ok',
    provisions: seed.provisions.length,
    definitions: seed.definitions.length,
  };
}

function writeIngestionReport(results: IngestResult[], docs: ParsedAct[]): void {
  const report = {
    generated_at: new Date().toISOString(),
    source: `${PORTAL_BASE_URL}/publiclaws`,
    categories: LAW_CATEGORIES,
    totals: {
      processed: results.length,
      ingested: results.filter(r => r.status === 'ok').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      documents: docs.length,
      provisions: docs.reduce((sum, d) => sum + d.provisions.length, 0),
      definitions: docs.reduce((sum, d) => sum + d.definitions.length, 0),
    },
    results,
  };

  fs.writeFileSync(
    path.join(SOURCE_DIR, 'ingestion-report.json'),
    JSON.stringify(report, null, 2),
    'utf-8',
  );
}

async function main(): Promise<void> {
  const { limit, skipFetch } = parseArgs();

  ensureDirs();
  if (!skipFetch) {
    clearOldSeeds();
  }

  console.log('Egyptian Law MCP -- Real Ingestion');
  console.log('===================================');
  console.log(`Source: ${PORTAL_BASE_URL}/publiclaws`);
  console.log(`Rate limit: 1.5s between requests`);
  if (limit) console.log(`Limit: ${limit}`);
  if (skipFetch) console.log('Using cached source files when available');
  console.log('');

  const discoveredLawIds = await loadCategoryLawIds(skipFetch);
  const lawIds = limit ? discoveredLawIds.slice(0, limit) : discoveredLawIds;

  console.log(`Discovered ${discoveredLawIds.length} laws in official categories.`);
  console.log(`Processing ${lawIds.length} law detail pages...\n`);

  const results: IngestResult[] = [];
  const docs: ParsedAct[] = [];

  for (const lawId of lawIds) {
    process.stdout.write(`- Law detail ${lawId}: `);

    try {
      const result = await processLaw(lawId, skipFetch);
      results.push(result);

      if (result.status === 'ok' && result.docId) {
        const seedPath = path.join(SEED_DIR, `${result.docId}.json`);
        const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as ParsedAct;
        docs.push(parsed);
        console.log(`OK (${result.provisions} provisions, ${result.definitions} definitions)`);
      } else if (result.status === 'skipped') {
        console.log(`SKIPPED (${result.reason})`);
      } else {
        console.log(`ERROR (${result.reason})`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ lawId, status: 'error', reason: message });
      console.log(`ERROR (${message})`);
    }
  }

  writeIngestionReport(results, docs);

  const ingested = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;
  const totalProvisions = docs.reduce((sum, d) => sum + d.provisions.length, 0);
  const totalDefinitions = docs.reduce((sum, d) => sum + d.definitions.length, 0);

  console.log('\nIngestion Summary');
  console.log('-----------------');
  console.log(`Processed:   ${results.length}`);
  console.log(`Ingested:    ${ingested}`);
  console.log(`Skipped:     ${skipped}`);
  console.log(`Errors:      ${errors}`);
  console.log(`Documents:   ${docs.length}`);
  console.log(`Provisions:  ${totalProvisions}`);
  console.log(`Definitions: ${totalDefinitions}`);
  console.log(`Report:      ${path.join(SOURCE_DIR, 'ingestion-report.json')}`);

  if (docs.length === 0) {
    throw new Error('No documents were ingested.');
  }
}

main().catch(error => {
  console.error('\nFatal ingestion error:', error);
  process.exit(1);
});
