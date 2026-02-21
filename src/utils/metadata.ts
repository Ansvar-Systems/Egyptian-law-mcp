/**
 * Response metadata utilities for Egyptian Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'Public Laws Portal (portal.investment.gov.eg/publiclaws) — Ministry of Investment and Foreign Trade (Egypt)',
    jurisdiction: 'EG',
    disclaimer:
      'This dataset is built from official Egyptian government portal content and extracted law PDFs. ' +
      'Always verify critical legal questions against the official published text.',
    freshness,
  };
}
