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

Real legislation ingested from Egypt's official Public Laws Portal (https://portal.investment.gov.eg/publiclaws), with article-level extraction from published law PDFs.

## License

Apache-2.0
