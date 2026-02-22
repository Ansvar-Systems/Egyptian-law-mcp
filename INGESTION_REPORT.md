# Real Ingestion Report (Egyptian Law MCP)

## Run Date
- 2026-02-22 (UTC)

## Official Source
- Portal: https://portal.investment.gov.eg/publiclaws
- Authority: Ministry of Investment and Foreign Trade (Egypt)
- Categories crawled: `16` (Investment), `17` (Foreign trading)
- Crawl strategy:
  - Discover categories from `/publiclaws/index`
  - Crawl each category with `All`, `Active`, `Amended`, and `Repealed` status filters
  - For each discovered law detail page, ingest all downloadable PDF attachments

## Ingestion Results
- Law detail pages discovered: 8
- Attachment documents processed: 14
- Documents ingested: 14
- Documents skipped: 0
- Errors: 0
- Documents in seed set: 14
- Provisions extracted: 1160
- Definitions extracted: 11
- OCR-ingested documents: 3 (`eg-law-155-2002`, `eg-law-173-2023`, `eg-law-121-1982-att-29`)

## Coverage Verification
- Category scan `1..40` found law-bearing categories only at `16` and `17`.
- Direct detail-page probes above current IDs (`35`, `40`, `50`, `80`, `100`, `120`, `150`, `200`, `300`, `500`, `1000`) returned no valid law metadata/downloads.
- As of 2026-02-22, the portal-exposed law catalog is 8 detail pages (`/publiclaws/details/27` through `/publiclaws/details/34`) with 14 downloadable PDF legal documents.

## Notes on OCR Coverage
- Three official portal PDFs were image-based and required OCR fallback.
- OCR fallback is enabled by `--allow-ocr` in `scripts/ingest.ts`.
- OCR output is source-derived but may include recognition noise; no text was fabricated.
- OCR-ingested document IDs:
  - `eg-law-155-2002` (download `23`)
  - `eg-law-173-2023` (download `27`)
  - `eg-law-121-1982-att-29` (download `29`)

## Ingested Seed Documents
- `eg-law-45-1982`
- `eg-law-118-1975`
- `eg-law-118-1975-att-26`
- `eg-law-120-1982`
- `eg-law-121-1982`
- `eg-law-121-1982-att-29` (OCR)
- `eg-law-121-1982-att-30`
- `eg-law-155-2002` (OCR)
- `eg-law-159-1981`
- `eg-law-159-1981-att-35`
- `eg-law-159-1981-att-36`
- `eg-law-173-2023` (OCR)
- `eg-law-72-2017`
- `eg-law-72-2017-att-31`

## Character-Match Verification (3 Provisions)
Provisions were re-parsed from official extracted PDF text and compared with stored seed content.

- `eg-law-121-1982` `art1`: exact match (`1234` chars)
- `eg-law-118-1975` `art1`: exact match (`1346` chars)
- `eg-law-159-1981` `art10`: exact match (`172` chars)

## Build/Test Status
- `npm run build:db`: passed
- `npm run build`: passed
- `npm test`: passed (`16/16`)
- `npx tsc --noEmit`: passed
