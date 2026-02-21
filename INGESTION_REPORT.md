# Real Ingestion Report (Egyptian Law MCP)

## Run Date
- 2026-02-21 (UTC)

## Official Source
- Portal: https://portal.investment.gov.eg/publiclaws
- Authority: Ministry of Investment and Foreign Trade (Egypt)
- Categories crawled: `16` (Investment), `17` (Foreign trading)

## Ingestion Results
- Laws discovered: 8
- Laws ingested: 6
- Laws skipped: 2
- Errors: 0
- Documents in seed set: 6
- Provisions extracted: 685
- Definitions extracted: 6

## Skipped Laws (No Fabrication)
- `lawId=28` (`Law 155/2002`): PDF text is image-only (no machine-extractable text)
- `lawId=31` (`Law 173/2023`): PDF text is image-only (no machine-extractable text)

## Ingested Seed Documents
- `eg-law-118-1975`
- `eg-law-120-1982`
- `eg-law-121-1982`
- `eg-law-159-1981`
- `eg-law-45-1982`
- `eg-law-72-2017`

## Character-Match Verification (3 Provisions)
Provisions were re-parsed from the official extracted PDF text and compared with stored seed content.

- `eg-law-121-1982` `art1`: exact match (`1234` chars)
- `eg-law-118-1975` `art1`: exact match (`1346` chars)
- `eg-law-159-1981` `art10`: exact match (`832` chars)

## Build/Test Status
- `npm run build`: passed
- `npm test`: passed (14/14)
- `npx tsc --noEmit`: passed
