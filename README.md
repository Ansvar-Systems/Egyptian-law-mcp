# Egyptian Law MCP

Egyptian law database for cybersecurity compliance via Model Context Protocol (MCP).

## Features

- **Full-text search** across legislation provisions (FTS5 with BM25 ranking)
- **Article-level retrieval** for specific legal provisions
- **Citation validation** to prevent hallucinated references
- **Currency checks** to verify if laws are still in force

## Quick Start

### Claude Code (Remote)
```bash
claude mcp add egyptian-law --transport http https://egyptian-law-mcp.vercel.app/mcp
```

### Local (npm)
```bash
npx @ansvar/egyptian-law-mcp
```

## Data Sources

Real legislation is ingested from Egypt's official Public Laws Portal: https://portal.investment.gov.eg/publiclaws.

- Coverage scope: all currently discoverable law detail pages from portal categories and status filters (`All`, `Active`, `Amended`, `Repealed`), and all downloadable PDF attachments on those detail pages.
- Current corpus snapshot (verified on February 22, 2026): 8 law detail pages (`/publiclaws/details/27` to `/publiclaws/details/34`) and 14 downloadable PDF legal documents ingested into `data/seed/`.
- Extraction pipeline: `pdftotext` first, with OCR fallback (`tesseract` or `tesseract.js`) for image-based PDFs.
- OCR note: OCR output is source-derived and may contain recognition noise; no legal text is fabricated.
- OCR-ingested documents (current corpus):
  - `eg-law-155-2002` (download `23`)
  - `eg-law-173-2023` (download `27`)
  - `eg-law-121-1982-att-29` (download `29`)

## License

Apache-2.0
