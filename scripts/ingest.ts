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
 * 3. Extract text via pdftotext, optionally fallback to OCR for image-only PDFs.
 * 4. Parse article-level provisions and write seed JSON under data/seed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { fetchBinaryWithRateLimit, fetchTextWithRateLimit, resolveUrl } from './lib/fetcher.js';
import {
  buildSeedFromPdfText,
  extractCategoryIdsFromIndexHtml,
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
const DEFAULT_CATEGORY_IDS = [16, 17];
const CATEGORY_STATUS_FILTERS = [
  { label: 'all', query: '' },
  { label: 'active', query: '?status=Active' },
  { label: 'amended', query: '?status=Amended' },
  { label: 'repealed', query: '?status=Repealed' },
];

interface CliArgs {
  limit: number | null;
  skipFetch: boolean;
  allowOcr: boolean;
  ocrLang: string;
}

interface ProcessOptions {
  skipFetch: boolean;
  allowOcr: boolean;
  ocrLang: string;
}

interface IngestResult {
  lawId: number;
  docId?: string;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  provisions?: number;
  definitions?: number;
  extraction_method?: 'pdftotext' | 'ocr';
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;
  let allowOcr = false;
  let ocrLang = 'ara+eng';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--skip-fetch') {
      skipFetch = true;
    } else if (args[i] === '--allow-ocr') {
      allowOcr = true;
    } else if (args[i] === '--ocr-lang' && args[i + 1]) {
      ocrLang = args[i + 1].trim();
      i++;
    }
  }

  return { limit, skipFetch, allowOcr, ocrLang };
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

function indexUrl(): string {
  return `${PORTAL_BASE_URL}/publiclaws/index`;
}

function detailUrl(lawId: number): string {
  return `${PORTAL_BASE_URL}/publiclaws/details/${lawId}`;
}

function hasCommand(commandName: string): boolean {
  const result = spawnSync('which', [commandName], { stdio: 'ignore' });
  return result.status === 0;
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

function pageNumberFromPngName(fileName: string): number {
  const match = fileName.match(/-(\d+)\.png$/);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function renderPdfToPngPages(pdfPath: string, tempDir: string): string[] {
  const outputPrefix = path.join(tempDir, 'page');
  const render = spawnSync('pdftoppm', ['-png', pdfPath, outputPrefix], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  if (render.status !== 0) {
    throw new Error(`pdftoppm failed (${render.status}): ${render.stderr || 'unknown error'}`);
  }

  const pages = fs
    .readdirSync(tempDir)
    .filter(name => /^page-\d+\.png$/.test(name))
    .sort((a, b) => pageNumberFromPngName(a) - pageNumberFromPngName(b));

  if (pages.length === 0) {
    throw new Error('no PNG pages produced for OCR');
  }

  return pages.map(page => path.join(tempDir, page));
}

function extractPdfTextViaSystemTesseract(pagePaths: string[], ocrLang: string): string {
  const chunks: string[] = [];

  for (const imagePath of pagePaths) {
    const ocr = spawnSync('tesseract', [imagePath, 'stdout', '-l', ocrLang, '--psm', '6'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });

    if (ocr.status !== 0) {
      const pageName = path.basename(imagePath);
      throw new Error(`tesseract failed on ${pageName}: ${ocr.stderr || 'unknown error'}`);
    }

    chunks.push(ocr.stdout);
  }

  return chunks.join('\n\f\n');
}

async function extractPdfTextViaTesseractJs(pagePaths: string[], ocrLang: string): Promise<string> {
  const tesseract = await import('tesseract.js');
  const langs = ocrLang.includes('+')
    ? ocrLang.split('+').map(s => s.trim()).filter(Boolean)
    : ocrLang.trim();

  const cachePath = path.join(SOURCE_DIR, '.tesseract-cache');
  fs.mkdirSync(cachePath, { recursive: true });

  const worker = await tesseract.createWorker(langs as string | string[], 1, {
    cachePath,
    logger: () => undefined,
  });

  const chunks: string[] = [];
  try {
    for (const imagePath of pagePaths) {
      const result = await worker.recognize(imagePath);
      chunks.push(result.data.text ?? '');
    }
  } finally {
    await worker.terminate();
  }

  return chunks.join('\n\f\n');
}

async function extractPdfTextViaOcr(
  pdfPath: string,
  lawId: number,
  downloadId: string,
  ocrLang: string,
): Promise<string> {
  if (!hasCommand('pdftoppm')) {
    throw new Error('pdftoppm is not installed');
  }

  const tempDir = path.join(SOURCE_DIR, `ocr-law-${lawId}-${downloadId}`);
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const pagePaths = renderPdfToPngPages(pdfPath, tempDir);
    if (hasCommand('tesseract')) {
      return extractPdfTextViaSystemTesseract(pagePaths, ocrLang);
    }

    return await extractPdfTextViaTesseractJs(pagePaths, ocrLang);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function hasMeaningfulText(text: string): boolean {
  return text.replace(/\s+/g, '').length > 100;
}

async function loadCategoryIds(skipFetch: boolean): Promise<number[]> {
  const cachePath = path.join(SOURCE_DIR, 'publiclaws-index.html');

  let html: string;
  if (skipFetch && fs.existsSync(cachePath)) {
    html = fs.readFileSync(cachePath, 'utf-8');
  } else {
    const response = await fetchTextWithRateLimit(indexUrl());
    if (response.status !== 200) {
      throw new Error(`Failed to fetch ${indexUrl()}: HTTP ${response.status}`);
    }
    html = response.body;
    fs.writeFileSync(cachePath, html, 'utf-8');
  }

  const discovered = extractCategoryIdsFromIndexHtml(html);
  if (discovered.length > 0) return discovered;

  return DEFAULT_CATEGORY_IDS;
}

async function loadCategoryLawIds(categoryIds: number[], skipFetch: boolean): Promise<number[]> {
  const ids = new Set<number>();

  for (const categoryId of categoryIds) {
    for (const status of CATEGORY_STATUS_FILTERS) {
      const url = `${categoryUrl(categoryId)}${status.query}`;
      const cachePath = path.join(SOURCE_DIR, `category-${categoryId}-${status.label}.html`);
      const legacyCachePath = path.join(SOURCE_DIR, `category-${categoryId}.html`);

      let html: string;
      if (skipFetch && fs.existsSync(cachePath)) {
        html = fs.readFileSync(cachePath, 'utf-8');
      } else if (skipFetch && status.label === 'all' && fs.existsSync(legacyCachePath)) {
        html = fs.readFileSync(legacyCachePath, 'utf-8');
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
  }

  return [...ids].sort((a, b) => a - b);
}

async function processLaw(lawId: number, options: ProcessOptions): Promise<IngestResult> {
  const detailCachePath = path.join(SOURCE_DIR, `law-${lawId}.html`);

  let html: string;
  if (options.skipFetch && fs.existsSync(detailCachePath)) {
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
  const ocrTextPath = path.join(SOURCE_DIR, `law-${lawId}-download-${downloadId}.ocr.txt`);

  if (!(options.skipFetch && fs.existsSync(pdfPath))) {
    const pdfResponse = await fetchBinaryWithRateLimit(pdfUrl);
    if (pdfResponse.status !== 200) {
      return { lawId, status: 'error', reason: `pdf HTTP ${pdfResponse.status}` };
    }
    fs.writeFileSync(pdfPath, pdfResponse.body);
  }

  const extractedText = extractPdfText(pdfPath);
  fs.writeFileSync(textPath, extractedText, 'utf-8');

  let finalText = extractedText;
  let extractionMethod: 'pdftotext' | 'ocr' = 'pdftotext';

  if (!hasMeaningfulText(extractedText)) {
    if (!options.allowOcr) {
      return {
        lawId,
        status: 'skipped',
        reason: 'PDF text is empty/image-only (rerun with --allow-ocr to attempt OCR fallback)',
      };
    }

    try {
      const ocrText = await extractPdfTextViaOcr(pdfPath, lawId, downloadId, options.ocrLang);
      fs.writeFileSync(ocrTextPath, ocrText, 'utf-8');

      if (!hasMeaningfulText(ocrText)) {
        return {
          lawId,
          status: 'skipped',
          reason: 'OCR fallback produced insufficient text',
        };
      }

      finalText = ocrText;
      extractionMethod = 'ocr';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        lawId,
        status: 'skipped',
        reason: `OCR fallback failed: ${message}`,
      };
    }
  }

  const seed = buildSeedFromPdfText(law, finalText, pdfUrl, {
    allowOrdinalFallback: extractionMethod === 'ocr',
  });
  if (!seed) {
    return {
      lawId,
      status: 'skipped',
      reason: 'no parseable article sections (مادة/Article) found in extracted text',
      extraction_method: extractionMethod,
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
    extraction_method: extractionMethod,
  };
}

function writeIngestionReport(results: IngestResult[], docs: ParsedAct[], categories: number[]): void {
  const report = {
    generated_at: new Date().toISOString(),
    source: `${PORTAL_BASE_URL}/publiclaws`,
    categories,
    totals: {
      processed: results.length,
      ingested: results.filter(r => r.status === 'ok').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      documents: docs.length,
      provisions: docs.reduce((sum, d) => sum + d.provisions.length, 0),
      definitions: docs.reduce((sum, d) => sum + d.definitions.length, 0),
      pdftotext_docs: results.filter(r => r.status === 'ok' && r.extraction_method === 'pdftotext').length,
      ocr_docs: results.filter(r => r.status === 'ok' && r.extraction_method === 'ocr').length,
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
  const { limit, skipFetch, allowOcr, ocrLang } = parseArgs();

  ensureDirs();
  if (!skipFetch) {
    clearOldSeeds();
  }

  console.log('Egyptian Law MCP -- Real Ingestion');
  console.log('===================================');
  console.log(`Source: ${PORTAL_BASE_URL}/publiclaws`);
  console.log('Rate limit: 1.5s between requests');
  if (limit) console.log(`Limit: ${limit}`);
  if (skipFetch) console.log('Using cached source files when available');
  if (allowOcr) {
    console.log(`OCR fallback: enabled (lang=${ocrLang})`);
  }
  console.log('');

  const categoryIds = await loadCategoryIds(skipFetch);
  const discoveredLawIds = await loadCategoryLawIds(categoryIds, skipFetch);
  const lawIds = limit ? discoveredLawIds.slice(0, limit) : discoveredLawIds;

  console.log(`Discovered ${categoryIds.length} categories: ${categoryIds.join(', ')}`);
  console.log(`Discovered ${discoveredLawIds.length} laws in official categories.`);
  console.log(`Processing ${lawIds.length} law detail pages...\n`);

  const results: IngestResult[] = [];
  const docs: ParsedAct[] = [];

  for (const lawId of lawIds) {
    process.stdout.write(`- Law detail ${lawId}: `);

    try {
      const result = await processLaw(lawId, { skipFetch, allowOcr, ocrLang });
      results.push(result);

      if (result.status === 'ok' && result.docId) {
        const seedPath = path.join(SEED_DIR, `${result.docId}.json`);
        const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as ParsedAct;
        docs.push(parsed);
        const method = result.extraction_method ?? 'pdftotext';
        console.log(`OK (${result.provisions} provisions, ${result.definitions} definitions, ${method})`);
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

  writeIngestionReport(results, docs, categoryIds);

  const ingested = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;
  const totalProvisions = docs.reduce((sum, d) => sum + d.provisions.length, 0);
  const totalDefinitions = docs.reduce((sum, d) => sum + d.definitions.length, 0);
  const ocrDocs = results.filter(r => r.status === 'ok' && r.extraction_method === 'ocr').length;

  console.log('\nIngestion Summary');
  console.log('-----------------');
  console.log(`Processed:   ${results.length}`);
  console.log(`Ingested:    ${ingested}`);
  console.log(`Skipped:     ${skipped}`);
  console.log(`Errors:      ${errors}`);
  console.log(`Documents:   ${docs.length}`);
  console.log(`Provisions:  ${totalProvisions}`);
  console.log(`Definitions: ${totalDefinitions}`);
  console.log(`OCR docs:    ${ocrDocs}`);
  console.log(`Report:      ${path.join(SOURCE_DIR, 'ingestion-report.json')}`);

  if (docs.length === 0) {
    throw new Error('No documents were ingested.');
  }
}

main().catch(error => {
  console.error('\nFatal ingestion error:', error);
  process.exit(1);
});
