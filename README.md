# Egyptian Law MCP Server

**The Egyptian legislative portal alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fegyptian-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/egyptian-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Egyptian-law-mcp?style=social)](https://github.com/Ansvar-Systems/Egyptian-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Egyptian-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Egyptian-law-mcp/actions/workflows/ci.yml)
[![Status](https://img.shields.io/badge/status-indexing_in_progress-yellow)]()

Query Egyptian legislation -- including القانون المدني (Civil Code), قانون العقوبات (Penal Code), قانون حماية البيانات الشخصية (Personal Data Protection Law), and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Egyptian legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists / لماذا يوجد هذا

Egyptian legal research is fragmented across the Official Gazette (الجريدة الرسمية), the State Council portal (مجلس الدولة), and various ministry websites -- often in Arabic-only PDFs with inconsistent numbering. Whether you're:

- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking obligations under Egypt's Personal Data Protection Law or Cybercrime Law
- A **legal tech developer** building tools on Egyptian law
- A **researcher** tracing legislative history across Egyptian codes and supplementary laws

...you shouldn't need dozens of browser tabs, Arabic OCR pipelines, and manual cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Egyptian law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://egyptian-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add egyptian-law --transport http https://egyptian-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "egyptian-law": {
      "type": "url",
      "url": "https://egyptian-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "egyptian-law": {
      "type": "http",
      "url": "https://egyptian-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/egyptian-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "egyptian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/egyptian-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "egyptian-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/egyptian-law-mcp"]
    }
  }
}
```

---

## Example Queries

مجرد اسأل بشكل طبيعي / Once connected, just ask naturally:

- *"ما الذي يقوله القانون المدني المصري في المادة 89 عن تكوين العقود؟"*
- *"ما الذي يقوله قانون العقوبات عن جرائم الحاسب الآلي والاتصالات؟"*
- *"ابحث عن أحكام حماية البيانات الشخصية في التشريع المصري"*
- *"ما متطلبات قانون حماية البيانات الشخصية رقم 151 لسنة 2020 للموافقة؟"*
- *"تحقق مما إذا كان قانون مكافحة جرائم تقنية المعلومات لا يزال سارياً"*
- *"ما العقوبات المنصوص عليها في قانون مكافحة الفساد المصري؟"*
- *"ابنِ موقفاً قانونياً بشأن مسؤولية صاحب العمل بموجب قانون العمل المصري"*
- *"What does Egypt's Personal Data Protection Law (Law 151/2020) say about data processor obligations?"*
- *"Search Egyptian law for provisions on anti-money laundering and suspicious transaction reporting"*

---

## What's Included

> **Note:** This release includes 0 indexed provisions -- Egyptian legal source ingestion is in progress. The server infrastructure, all 13 tools, and the full API are operational. Content will populate as ingestion completes.

| Category | Count | Details |
|----------|-------|---------|
| **Laws** | 0 (indexing in progress) | Egyptian legislation from Official Gazette and ministry portals |
| **Provisions** | 0 (indexing in progress) | Full-text searchable with FTS5 once populated |
| **Database Size** | -- | Will grow as ingestion completes |
| **Target Coverage** | Egyptian Civil Code, Penal Code, Commercial Code, key regulatory laws | Priority laws indexed first |

**What's operational now:** All 13 tools respond correctly. Citation validation, `list_sources`, and `about` work against the current database state. Search and retrieval tools return results as laws are indexed.

**Verified data only** -- every citation will be validated against official sources (Official Gazette, ministry portals). Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from official Egyptian legal sources (Official Gazette, State Council portal)
- Arabic text processing uses OCR and structured extraction to preserve exact provision text
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains legislation text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by law number and article
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
Official Gazette (Arabic PDF) --> OCR/Parse --> SQLite --> FTS5 snippet() --> MCP response
                                    ^                            ^
                             Arabic text extractor       Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search Official Gazette by law number | Search by plain Arabic: *"حماية البيانات الشخصية"* |
| Navigate multi-article codes manually | Get the exact provision with context |
| Manual cross-referencing between laws | `build_legal_stance` aggregates across sources |
| "Is this law still in force?" -- check manually | `check_currency` tool -- answer in seconds |
| Find Arab League/international basis -- dig manually | `get_eu_basis` -- linked frameworks instantly |
| No API, no Arabic-capable integration | MCP protocol -- AI-native with Arabic support |

**Traditional:** Search Official Gazette --> Find PDF --> OCR Arabic text --> Ctrl+F --> Cross-reference with supplementary laws --> Repeat

**This MCP:** *"ما متطلبات الموافقة في قانون حماية البيانات الشخصية وكيف تتوافق مع اللائحة الأوروبية العامة؟"* --> Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across provisions with BM25 ranking. Supports Arabic text search, quoted phrases, boolean operators |
| `get_provision` | Retrieve specific provision by law number and article |
| `check_currency` | Check if a law is in force, amended, or repealed |
| `validate_citation` | Validate citation against database -- zero-hallucination check |
| `build_legal_stance` | Aggregate citations from multiple laws for a legal topic |
| `format_citation` | Format citations per Egyptian legal conventions (full/short/pinpoint) |
| `list_sources` | List all available laws with metadata, coverage scope, and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### International Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get international frameworks (Arab League conventions, GDPR alignment) that an Egyptian law relates to |
| `get_egyptian_implementations` | Find Egyptian laws implementing a specific international convention or treaty |
| `search_eu_implementations` | Search international documents with Egyptian implementation counts |
| `get_provision_eu_basis` | Get international law references for a specific provision |
| `validate_eu_compliance` | Check alignment status of Egyptian laws against international frameworks |

---

## International Law Alignment

Egypt is a member of the Arab League and has ratified numerous international conventions that shape domestic legislation:

- **Arab League Conventions:** Egypt has ratified Arab League conventions on combating cybercrime (Arab Convention on Combating Information Technology Offences, 2010), which informs the Cybercrime Law (Law 175/2018)
- **African Union:** Egypt is an AU member and participates in the Malabo Convention on cyber security and personal data protection
- **GDPR Proximity:** Egypt's Personal Data Protection Law (Law 151/2020) draws directly from GDPR structure -- controllers, processors, data subject rights, and cross-border transfer rules follow GDPR Chapter patterns
- **UN Conventions:** Egypt has ratified UNCAC (anti-corruption), UNTOC (organized crime), and the Vienna Conventions, which are implemented in domestic criminal law
- **WTO/TRIPS:** Egypt's intellectual property law implements TRIPS obligations

The international alignment tools allow you to explore these relationships -- checking which Egyptian provisions correspond to international obligations, and vice versa.

> **Note:** International cross-references reflect alignment and implementation relationships. Egypt adopts its own legislative approach through Parliament and Presidential Decrees.

---

## Data Sources & Freshness

Content will be sourced from authoritative Egyptian legal databases:

- **[Official Gazette (الجريدة الرسمية)](https://www.op.gov.eg/)** -- Official publication of Egyptian legislation
- **[State Council Portal (مجلس الدولة)](http://www.conseil-etat.eg/)** -- Administrative court legislation and rulings
- **Ministry of Justice portals** -- Consolidated law texts

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Egyptian Government (Official Gazette, State Council) |
| **Language** | Arabic (primary), English translations where available |
| **Status** | Ingestion in progress |
| **Target coverage** | Civil Code, Penal Code, Commercial Code, Personal Data Protection Law, Cybercrime Law, Labour Law, Companies Law |

### Automated Freshness Checks

A GitHub Actions workflow will monitor Egyptian legislative sources for changes once ingestion is complete.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text will be sourced from official Egyptian government sources. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** -- do not rely solely on this for case law research
> - **Verify critical citations** against the Official Gazette (الجريدة الرسمية) for court filings
> - **International cross-references** reflect alignment relationships, not direct transposition
> - **Egyptian law is primarily in Arabic** -- users should verify Arabic-language provisions against the official Arabic text
> - **Governorate-level regulations** are not included -- this covers national legislation only

For professional legal advice in Egypt, consult a member of the **Egyptian Bar Association (نقابة المحامين المصريين)**.

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [SECURITY.md](SECURITY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Egyptian-law-mcp
cd Egyptian-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                         # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js    # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest          # Ingest laws from Egyptian legal portals
npm run build:db        # Rebuild SQLite database
npm run drift:detect    # Run drift detection against anchors
npm run check-updates   # Check for amendments and new laws
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries (once populated)
- **Reliability:** Designed for 100% ingestion success rate

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)
**Query US federal and state compliance laws** -- HIPAA, CCPA, SOX, GLBA, FERPA, and more. `npx @ansvar/us-regulations-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

**70+ national law MCPs** covering Australia, Brazil, Canada, Denmark, Finland, France, Germany, Ghana, India, Ireland, Italy, Japan, Kenya, Netherlands, Nigeria, Norway, Singapore, South Africa, Sweden, Switzerland, Turkey, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Arabic text ingestion pipeline improvements
- OCR quality for Official Gazette PDFs
- Court case law (Court of Cassation decisions)
- Historical law versions and amendment tracking

---

## Roadmap

- [x] Server infrastructure and all 13 tools
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Core law ingestion (Civil Code, Penal Code, Commercial Code)
- [ ] Personal Data Protection Law (Law 151/2020) full provisions
- [ ] Cybercrime Law (Law 175/2018) full provisions
- [ ] Labour Law and Companies Law
- [ ] Court of Cassation case law
- [ ] Historical law versions (amendment tracking)
- [ ] Arabic full-text search optimization

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{egyptian_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Egyptian Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Egyptian-law-mcp},
  note = {Egyptian legislation with Arabic text support and international law alignment (indexing in progress)}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Egyptian Government (Official Gazette -- public domain)
- **International Metadata:** Arab League, African Union, UN bodies (public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. Egyptian law presents unique challenges -- Arabic-primary sources, multi-source publication, and complex code structures -- that make AI-readable tooling especially valuable.

So we're building it. Navigating Egyptian legislation shouldn't require OCR pipelines and manual cross-referencing.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
