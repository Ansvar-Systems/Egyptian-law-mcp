#!/usr/bin/env tsx
/**
 * Egyptian Law MCP -- Full corpus ingestion from manshurat.org
 *
 * Fallback source when portal.investment.gov.eg is unavailable.
 * Manshurat.org is a free legal archive hosted by the Law and Society
 * Research Unit at the American University in Cairo.
 *
 * Source: https://manshurat.org/taxonomy/term/23 (Laws category)
 *
 * Strategy:
 * 1. Crawl taxonomy listing pages to discover all law URLs.
 * 2. For each law, fetch detail page and extract metadata + PDF download link.
 * 3. Download PDFs, extract text via pdftotext, optionally fallback to OCR.
 * 4. Parse article-level provisions and write seed JSON under data/seed.
 *
 * Resumable: uses checkpoint files to resume from where it left off.
 *
 * Usage:
 *   npx tsx scripts/ingest-manshurat.ts [--limit N] [--skip-fetch] [--allow-ocr] [--resume]
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { fetchBinaryWithRateLimit, fetchTextWithRateLimit, setRateLimitDelay } from './lib/fetcher.js';
import {
  extractLawPathsFromListingHtml,
  extractLastPageNumber,
  parseManshuratLawDetailHtml,
  normalizeArabicDigits,
  type ManshuratLawDetail,
} from './lib/manshurat-parser.js';
import {
  buildSeedFromPdfText,
  type ParsedAct,
  type PortalLawDetail,
} from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source-manshurat');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CHECKPOINT_FILE = path.resolve(SOURCE_DIR, 'checkpoint.json');

const MANSHURAT_BASE_URL = 'https://manshurat.org';
const TAXONOMY_PATH = '/taxonomy/term/23';

interface CliArgs {
  limit: number | null;
  skipFetch: boolean;
  allowOcr: boolean;
  ocrLang: string;
  resume: boolean;
  startPage: number;
}

interface Checkpoint {
  discoveredPaths: string[];
  processedPaths: string[];
  lastListingPage: number;
  discoveryComplete: boolean;
}

interface IngestResult {
  path: string;
  nodeId: string;
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
  let resume = false;
  let startPage = 0;

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
    } else if (args[i] === '--resume') {
      resume = true;
    } else if (args[i] === '--start-page' && args[i + 1]) {
      startPage = Number.parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { limit, skipFetch, allowOcr, ocrLang, resume, startPage };
}

function ensureDirs(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function loadCheckpoint(): Checkpoint {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
  }
  return {
    discoveredPaths: [],
    processedPaths: [],
    lastListingPage: -1,
    discoveryComplete: false,
  };
}

function saveCheckpoint(checkpoint: Checkpoint): void {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2), 'utf-8');
}

function hasCommand(commandName: string): boolean {
  const result = spawnSync('which', [commandName], { stdio: 'ignore' });
  return result.status === 0;
}

/**
 * Some manshurat.org PDFs have HTML appended to the end of the binary
 * (server-side glitch). Detect and repair by truncating at the HTML boundary.
 */
function repairPdfIfNeeded(pdfPath: string): boolean {
  const data = fs.readFileSync(pdfPath);
  // Check if the file ends with HTML
  const tail = data.subarray(Math.max(0, data.length - 500));
  const tailStr = tail.toString('utf-8');

  if (tailStr.includes('</html>') || tailStr.includes('</body>')) {
    // Find where HTML starts (look for "<!DOCTYPE" or "<html" after the PDF header)
    const fullStr = data.toString('binary');
    // Look for the start of HTML content (typically starts after the PDF %%EOF marker)
    const eofIdx = fullStr.lastIndexOf('%%EOF');
    if (eofIdx > 0) {
      // Truncate at %%EOF + line ending
      let truncateAt = eofIdx + 5;
      while (truncateAt < data.length && (data[truncateAt] === 0x0d || data[truncateAt] === 0x0a)) {
        truncateAt++;
      }
      fs.writeFileSync(pdfPath, data.subarray(0, truncateAt));
      return true;
    }
  }
  return false;
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
  if (pages.length === 0) throw new Error('no PNG pages produced for OCR');
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
      throw new Error(`tesseract failed on ${path.basename(imagePath)}: ${ocr.stderr || 'unknown error'}`);
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
  nodeId: string,
  ocrLang: string,
): Promise<string> {
  if (!hasCommand('pdftoppm')) throw new Error('pdftoppm is not installed');
  const tempDir = path.join(SOURCE_DIR, `ocr-node-${nodeId}`);
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

/**
 * Convert ManshuratLawDetail to the PortalLawDetail interface expected by
 * the existing buildSeedFromPdfText function.
 */
function toPortalLawDetail(law: ManshuratLawDetail): PortalLawDetail {
  return {
    lawNumber: law.lawNumber,
    lawYear: law.lawYear,
    titleEn: '', // Manshurat is Arabic-only
    titleAr: law.titleAr,
    shortName: law.shortName,
    status: law.status,
    issuedDate: law.issuedDate,
    effectiveDate: law.effectiveDate,
    description: law.description,
    detailUrl: law.detailUrl,
    attachments: [],
  };
}

/**
 * Generate a stable document ID from the law metadata.
 */
function makeDocId(law: ManshuratLawDetail): string {
  const num = law.lawNumber.replace(/[^0-9]/g, '') || law.nodeId;
  const year = law.lawYear.replace(/[^0-9]/g, '') || 'unknown';
  if (year === 'unknown') {
    return `eg-manshurat-${law.nodeId}`;
  }
  return `eg-law-${num}-${year}`;
}

async function discoverLawPaths(
  checkpoint: Checkpoint,
  skipFetch: boolean,
  startPage: number,
  limit: number | null,
): Promise<string[]> {
  if (checkpoint.discoveryComplete && checkpoint.discoveredPaths.length > 0) {
    console.log(`Using ${checkpoint.discoveredPaths.length} previously discovered law paths.`);
    return checkpoint.discoveredPaths;
  }

  const allPaths = new Set<string>(checkpoint.discoveredPaths);
  const resumeFromPage = Math.max(checkpoint.lastListingPage + 1, startPage);

  // If we already have enough paths for the limit, use what we have
  if (limit && allPaths.size >= limit) {
    console.log(`Already have ${allPaths.size} paths (limit ${limit}), skipping further discovery.`);
    return checkpoint.discoveredPaths;
  }

  // First, determine the total number of pages
  console.log('Discovering law listing pages...');
  const firstPageCachePath = path.join(SOURCE_DIR, 'listing-page-0.html');
  let firstPageHtml: string;

  if (skipFetch && fs.existsSync(firstPageCachePath)) {
    firstPageHtml = fs.readFileSync(firstPageCachePath, 'utf-8');
  } else {
    const response = await fetchTextWithRateLimit(`${MANSHURAT_BASE_URL}${TAXONOMY_PATH}`);
    if (response.status !== 200) {
      throw new Error(`Failed to fetch listing page 0: HTTP ${response.status}`);
    }
    firstPageHtml = response.body;
    fs.writeFileSync(firstPageCachePath, firstPageHtml, 'utf-8');
  }

  const lastPage = extractLastPageNumber(firstPageHtml);
  console.log(`Listing pages: 0 to ${lastPage} (${lastPage + 1} pages total)`);

  // Extract laws from page 0
  if (resumeFromPage === 0) {
    for (const entry of extractLawPathsFromListingHtml(firstPageHtml)) {
      allPaths.add(entry.path);
    }
    checkpoint.lastListingPage = 0;
  }

  // Crawl remaining pages (stop early if we have enough for the limit)
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 5;

  for (let page = resumeFromPage === 0 ? 1 : resumeFromPage; page <= lastPage; page++) {
    // Early termination: if limit is set and we have 2x the needed paths, stop discovery
    if (limit && allPaths.size >= limit * 2) {
      console.log(`\n  Early stop: ${allPaths.size} paths discovered (${limit * 2} >= 2x limit).`);
      break;
    }

    const cachePath = path.join(SOURCE_DIR, `listing-page-${page}.html`);
    let html: string;

    if (skipFetch && fs.existsSync(cachePath)) {
      html = fs.readFileSync(cachePath, 'utf-8');
      consecutiveErrors = 0;
    } else {
      try {
        const url = `${MANSHURAT_BASE_URL}${TAXONOMY_PATH}?page=${page}`;
        const response = await fetchTextWithRateLimit(url);
        if (response.status !== 200) {
          consecutiveErrors++;
          console.log(`\n  Warning: listing page ${page} returned HTTP ${response.status}`);
          if (consecutiveErrors >= maxConsecutiveErrors) {
            console.log(`  Stopping discovery after ${maxConsecutiveErrors} consecutive errors.`);
            break;
          }
          continue;
        }
        html = response.body;
        fs.writeFileSync(cachePath, html, 'utf-8');
        consecutiveErrors = 0;
      } catch (error) {
        consecutiveErrors++;
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`\n  Error on listing page ${page}: ${msg}`);
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.log(`  Stopping discovery after ${maxConsecutiveErrors} consecutive errors.`);
          break;
        }
        continue;
      }
    }

    const entries = extractLawPathsFromListingHtml(html);
    for (const entry of entries) {
      allPaths.add(entry.path);
    }

    checkpoint.lastListingPage = page;
    checkpoint.discoveredPaths = [...allPaths];

    // Save checkpoint every 10 pages
    if (page % 10 === 0) {
      saveCheckpoint(checkpoint);
      process.stdout.write(`\r  Discovered ${allPaths.size} laws across ${page + 1}/${lastPage + 1} pages...`);
    }
  }

  checkpoint.discoveredPaths = [...allPaths];
  // Only mark complete if we made it through all pages without early termination
  if (checkpoint.lastListingPage >= lastPage) {
    checkpoint.discoveryComplete = true;
  }
  saveCheckpoint(checkpoint);

  console.log(`\n  Discovery: ${allPaths.size} unique law paths found across ${checkpoint.lastListingPage + 1} pages.`);
  return checkpoint.discoveredPaths;
}

async function processLaw(
  lawPath: string,
  options: { skipFetch: boolean; allowOcr: boolean; ocrLang: string },
): Promise<IngestResult> {
  const safeFilename = lawPath.replace(/\//g, '_').replace(/^_/, '');
  const detailCachePath = path.join(SOURCE_DIR, `detail-${safeFilename}.html`);

  // Fetch detail page
  let html: string;
  if (options.skipFetch && fs.existsSync(detailCachePath)) {
    html = fs.readFileSync(detailCachePath, 'utf-8');
  } else if (options.skipFetch) {
    // No cached file and --skip-fetch is set: skip this law
    return {
      path: lawPath,
      nodeId: lawPath,
      status: 'skipped',
      reason: 'no cached detail page (--skip-fetch)',
    };
  } else {
    const url = `${MANSHURAT_BASE_URL}${lawPath}`;
    const response = await fetchTextWithRateLimit(url);
    if (response.status !== 200) {
      return {
        path: lawPath,
        nodeId: lawPath,
        status: 'error',
        reason: `detail HTTP ${response.status}`,
      };
    }
    html = response.body;
    fs.writeFileSync(detailCachePath, html, 'utf-8');
  }

  // Parse metadata
  const law = parseManshuratLawDetailHtml(html, lawPath, MANSHURAT_BASE_URL);
  if (!law) {
    return {
      path: lawPath,
      nodeId: lawPath,
      status: 'skipped',
      reason: 'unable to parse law metadata from page',
    };
  }

  // Check for PDF download
  if (!law.pdfDownloadPath) {
    return {
      path: lawPath,
      nodeId: law.nodeId,
      status: 'skipped',
      reason: 'no PDF download link found on page',
    };
  }

  // Download PDF
  const pdfPath = path.join(SOURCE_DIR, `pdf-node-${law.nodeId}.pdf`);
  const textPath = path.join(SOURCE_DIR, `pdf-node-${law.nodeId}.txt`);

  if (options.skipFetch && !fs.existsSync(pdfPath)) {
    return {
      path: lawPath,
      nodeId: law.nodeId,
      status: 'skipped',
      reason: 'no cached PDF (--skip-fetch)',
    };
  }
  if (!fs.existsSync(pdfPath)) {
    const pdfUrl = `${MANSHURAT_BASE_URL}${law.pdfDownloadPath}`;
    const pdfResponse = await fetchBinaryWithRateLimit(pdfUrl);
    if (pdfResponse.status !== 200) {
      return {
        path: lawPath,
        nodeId: law.nodeId,
        status: 'error',
        reason: `PDF download HTTP ${pdfResponse.status}`,
      };
    }
    fs.writeFileSync(pdfPath, pdfResponse.body);
  }

  // Extract text from PDF (repair corrupted files first)
  let extractedText: string;
  try {
    extractedText = extractPdfText(pdfPath);
  } catch {
    // Try repairing the PDF (some have HTML appended by server)
    const repaired = repairPdfIfNeeded(pdfPath);
    if (repaired) {
      try {
        extractedText = extractPdfText(pdfPath);
      } catch (err2) {
        return {
          path: lawPath,
          nodeId: law.nodeId,
          status: 'error',
          reason: `pdftotext failed after repair: ${err2 instanceof Error ? err2.message : String(err2)}`,
        };
      }
    } else {
      return {
        path: lawPath,
        nodeId: law.nodeId,
        status: 'error',
        reason: 'pdftotext failed and PDF repair was not applicable',
      };
    }
  }
  fs.writeFileSync(textPath, extractedText, 'utf-8');

  let finalText = extractedText;
  let extractionMethod: 'pdftotext' | 'ocr' = 'pdftotext';

  if (!hasMeaningfulText(extractedText)) {
    if (!options.allowOcr) {
      return {
        path: lawPath,
        nodeId: law.nodeId,
        status: 'skipped',
        reason: 'PDF text is empty/image-only (rerun with --allow-ocr)',
      };
    }
    try {
      const ocrText = await extractPdfTextViaOcr(pdfPath, law.nodeId, options.ocrLang);
      const ocrTextPath = path.join(SOURCE_DIR, `pdf-node-${law.nodeId}.ocr.txt`);
      fs.writeFileSync(ocrTextPath, ocrText, 'utf-8');
      if (!hasMeaningfulText(ocrText)) {
        return {
          path: lawPath,
          nodeId: law.nodeId,
          status: 'skipped',
          reason: 'OCR fallback produced insufficient text',
        };
      }
      finalText = ocrText;
      extractionMethod = 'ocr';
    } catch (err) {
      return {
        path: lawPath,
        nodeId: law.nodeId,
        status: 'skipped',
        reason: `OCR failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Convert to PortalLawDetail format and use existing parser
  const portalLaw = toPortalLawDetail(law);
  const pdfUrl = `${MANSHURAT_BASE_URL}${law.pdfDownloadPath}`;

  const seed = buildSeedFromPdfText(portalLaw, finalText, pdfUrl, {
    allowOrdinalFallback: extractionMethod === 'ocr',
    preferCanonicalLawTitle: false,
    titleEnOverride: undefined,
    shortNameOverride: law.shortName,
    urlOverride: law.detailUrl,
  });

  if (!seed) {
    return {
      path: lawPath,
      nodeId: law.nodeId,
      status: 'skipped',
      reason: 'no parseable article sections (مادة/Article) found in extracted text',
      extraction_method: extractionMethod,
    };
  }

  // Override the auto-generated ID with our stable ID
  const docId = makeDocId(law);

  // Use Arabic title from manshurat metadata if richer than PDF-extracted one
  const finalSeed: ParsedAct = {
    ...seed,
    id: docId,
    title: law.titleAr || seed.title,
    short_name: law.shortName,
    url: law.detailUrl,
  };

  const seedPath = path.join(SEED_DIR, `${docId}.json`);

  // If a seed with this ID already exists (duplicate law number/year), use node ID suffix
  if (fs.existsSync(seedPath)) {
    const existingSeed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    if (existingSeed.url !== law.detailUrl) {
      finalSeed.id = `${docId}-n${law.nodeId}`;
      const altPath = path.join(SEED_DIR, `${finalSeed.id}.json`);
      fs.writeFileSync(altPath, JSON.stringify(finalSeed, null, 2), 'utf-8');
    } else {
      fs.writeFileSync(seedPath, JSON.stringify(finalSeed, null, 2), 'utf-8');
    }
  } else {
    fs.writeFileSync(seedPath, JSON.stringify(finalSeed, null, 2), 'utf-8');
  }

  return {
    path: lawPath,
    nodeId: law.nodeId,
    docId: finalSeed.id,
    status: 'ok',
    provisions: finalSeed.provisions.length,
    definitions: finalSeed.definitions.length,
    extraction_method: extractionMethod,
  };
}

async function main(): Promise<void> {
  const { limit, skipFetch, allowOcr, ocrLang, resume, startPage } = parseArgs();

  ensureDirs();

  console.log('Egyptian Law MCP -- Manshurat.org Full Corpus Ingestion');
  console.log('=======================================================');
  console.log(`Source: ${MANSHURAT_BASE_URL}${TAXONOMY_PATH}`);
  console.log('Rate limit: 1.5s between requests');
  if (limit) console.log(`Limit: ${limit} laws`);
  if (skipFetch) console.log('Using cached source files when available');
  if (resume) console.log('Resuming from checkpoint');
  if (allowOcr) console.log(`OCR fallback: enabled (lang=${ocrLang})`);
  console.log('');

  // Load or create checkpoint
  let checkpoint = resume ? loadCheckpoint() : {
    discoveredPaths: [],
    processedPaths: [],
    lastListingPage: -1,
    discoveryComplete: false,
  };

  // Use a 10s delay for manshurat.org to avoid aggressive rate limiting.
  // The server throttles heavily after ~100 requests at lower delays.
  // At 10s/request, a batch of 50 takes ~8 minutes but avoids blocking.
  setRateLimitDelay(10_000);

  // Phase 1: Discover law paths (lazy: stops early when limit is set)
  const allPaths = await discoverLawPaths(checkpoint, skipFetch, startPage, limit);
  const processedSet = new Set(checkpoint.processedPaths);

  // Determine which paths to process
  let pathsToProcess = allPaths.filter(p => !processedSet.has(p));
  if (limit) {
    pathsToProcess = pathsToProcess.slice(0, limit);
  }

  console.log(`\nTotal discovered: ${allPaths.length} laws`);
  console.log(`Already processed: ${processedSet.size}`);
  console.log(`To process: ${pathsToProcess.length}\n`);

  if (!resume) {
    // Clear old seeds only if not resuming
    for (const file of fs.readdirSync(SEED_DIR)) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(SEED_DIR, file));
      }
    }
  }

  // Phase 2: Process each law
  const results: IngestResult[] = [];
  const docs: ParsedAct[] = [];
  let processedCount = 0;

  for (const lawPath of pathsToProcess) {
    processedCount++;
    const progress = `[${processedCount}/${pathsToProcess.length}]`;

    try {
      const result = await processLaw(lawPath, { skipFetch, allowOcr, ocrLang });
      results.push(result);

      if (result.status === 'ok' && result.docId) {
        const seedPath = path.join(SEED_DIR, `${result.docId}.json`);
        if (fs.existsSync(seedPath)) {
          const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as ParsedAct;
          docs.push(parsed);
        }
        console.log(
          `${progress} OK: ${result.docId} (${result.provisions} provisions, ${result.extraction_method})`,
        );
      } else if (result.status === 'skipped') {
        console.log(`${progress} SKIP: ${lawPath} -- ${result.reason}`);
      } else {
        console.log(`${progress} ERROR: ${lawPath} -- ${result.reason}`);
      }

      // Update checkpoint (don't mark skip-fetch cache misses as processed)
      const isSkipFetchMiss = result.status === 'skipped' &&
        (result.reason?.includes('--skip-fetch') ?? false);
      if (!isSkipFetchMiss) {
        checkpoint.processedPaths.push(lawPath);
      }
      if (processedCount % 25 === 0) {
        saveCheckpoint(checkpoint);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ path: lawPath, nodeId: lawPath, status: 'error', reason: message });
      console.log(`${progress} ERROR: ${lawPath} -- ${message}`);

      checkpoint.processedPaths.push(lawPath);
    }
  }

  // Save final checkpoint
  saveCheckpoint(checkpoint);

  // Write ingestion report
  const report = {
    generated_at: new Date().toISOString(),
    source: `${MANSHURAT_BASE_URL}${TAXONOMY_PATH}`,
    totals: {
      laws_discovered: allPaths.length,
      laws_processed: results.length,
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

  const ingested = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;
  const totalProvisions = docs.reduce((sum, d) => sum + d.provisions.length, 0);
  const totalDefinitions = docs.reduce((sum, d) => sum + d.definitions.length, 0);
  const ocrDocs = results.filter(r => r.status === 'ok' && r.extraction_method === 'ocr').length;

  console.log('\n\nIngestion Summary');
  console.log('-----------------');
  console.log(`Laws discovered: ${allPaths.length}`);
  console.log(`Processed:       ${results.length}`);
  console.log(`Ingested:        ${ingested}`);
  console.log(`Skipped:         ${skipped}`);
  console.log(`Errors:          ${errors}`);
  console.log(`Documents:       ${docs.length}`);
  console.log(`Provisions:      ${totalProvisions}`);
  console.log(`Definitions:     ${totalDefinitions}`);
  console.log(`OCR docs:        ${ocrDocs}`);
  console.log(`Report:          ${path.join(SOURCE_DIR, 'ingestion-report.json')}`);

  if (docs.length === 0 && !resume) {
    console.log('\nWARNING: No documents were ingested. Check the results above.');
    process.exit(1);
  }

  // When resuming, count total seeds on disk
  if (resume) {
    const totalSeeds = fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json')).length;
    console.log(`Total seeds on disk: ${totalSeeds}`);
  }
}

main().catch(error => {
  console.error('\nFatal ingestion error:', error);
  process.exit(1);
});
