# Real Ingestion Report (Egyptian Law MCP)

## Run Date
- 2026-02-21 (UTC)

## Official Source
- Portal: https://portal.investment.gov.eg/publiclaws
- Authority: Ministry of Investment and Foreign Trade (Egypt)
- Categories crawled: `16` (Investment), `17` (Foreign trading)

## Ingestion Results
- Laws discovered: 8
- Laws ingested: 8
- Laws skipped: 0
- Errors: 0
- Documents in seed set: 8
- Provisions extracted: 697
- Definitions extracted: 6
- OCR-ingested documents: 2 (`eg-law-155-2002`, `eg-law-173-2023`)

## Notes on OCR Coverage
- Two official portal PDFs are image-based and required OCR fallback.
- OCR fallback is enabled by `--allow-ocr` in `scripts/ingest.ts`.
- OCR output is source-derived but may include recognition noise; no text was fabricated.

## Ingested Seed Documents
- `eg-law-45-1982`
- `eg-law-72-2017`
- `eg-law-118-1975`
- `eg-law-120-1982`
- `eg-law-121-1982`
- `eg-law-155-2002` (OCR)
- `eg-law-159-1981`
- `eg-law-173-2023` (OCR)

## Character-Match Verification (3 Provisions)
Provisions were re-parsed from official extracted PDF text and compared with stored seed content.

- `eg-law-121-1982` `art1`: exact match (`1234` chars)
- `eg-law-118-1975` `art1`: exact match (`1346` chars)
- `eg-law-159-1981` `art10`: exact match (`832` chars)

## Build/Test Status
- `npm run build:db`: passed
- `npm run build`: passed
- `npm test`: passed (`16/16`)
- `npx tsc --noEmit`: passed
