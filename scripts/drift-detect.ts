#!/usr/bin/env tsx
/**
 * Drift detection for Egyptian Law MCP.
 *
 * Validates that selected upstream law pages/PDFs still include expected snippets.
 * Source corpus: https://portal.investment.gov.eg/publiclaws
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const hashesPath = join(__dirname, '../fixtures/golden-hashes.json');

interface GoldenHash {
  id: string;
  description: string;
  upstream_url: string;
  expected_sha256?: string;
  expected_snippet?: string;
}

interface HashFixture {
  version: string;
  provisions?: GoldenHash[];
  hashes?: Record<string, unknown>;
}

async function main(): Promise<void> {
  console.log('Egyptian Law MCP -- Drift Detection');
  console.log('====================================\n');

  const fixture: HashFixture = JSON.parse(readFileSync(hashesPath, 'utf-8'));
  const checks = fixture.provisions ?? [];

  if (checks.length === 0) {
    console.log('No drift checks configured in fixtures/golden-hashes.json.');
    console.log('Skipping drift detection.');
    return;
  }

  console.log(`Checking ${checks.length} provisions...\n`);

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    try {
      const response = await fetch(check.upstream_url, {
        headers: { 'User-Agent': 'Egyptian-Law-MCP/1.0 drift-detect' },
      });

      if (response.status !== 200) {
        console.log(`  WARN ${check.id}: HTTP ${response.status}`);
        failed++;
        continue;
      }

      const body = await response.text();
      const snippet = check.expected_snippet?.trim();

      if (!snippet) {
        console.log(`  SKIP ${check.id}: No expected snippet configured`);
        continue;
      }

      if (body.includes(snippet)) {
        console.log(`  OK   ${check.id}: Snippet found`);
        passed++;
      } else {
        console.log(`  DRIFT ${check.id}: Expected snippet not found`);
        failed++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR ${check.id}: ${message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
