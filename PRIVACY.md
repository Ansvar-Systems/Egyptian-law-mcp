# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Egyptian bar association rules.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- Egyptian bar rules (Egyptian Bar Association — نقابة المحامين المصرية) require strict confidentiality (سرية المهنة) and data processing controls

**Safe Use Options:**
1. **General Legal Research**: Use Tool for non-client-specific queries
2. **Local npm Package**: Install `@ansvar/egyptian-law-mcp` locally — database queries stay on your machine
3. **Remote Endpoint**: Vercel Streamable HTTP endpoint — queries transit Vercel infrastructure
4. **On-Premise Deployment**: Self-host with local LLM for privileged matters

---

## Data Flows and Infrastructure

### MCP (Model Context Protocol) Architecture

This Tool uses the **Model Context Protocol (MCP)** to communicate with AI clients:

```
User Query -> MCP Client (Claude Desktop/Cursor/API) -> Anthropic Cloud -> MCP Server -> Database
```

### Deployment Options

#### 1. Local npm Package (Most Private)

```bash
npx @ansvar/egyptian-law-mcp
```

- Database is local SQLite file on your machine
- No data transmitted to external servers (except to AI client for LLM processing)
- Full control over data at rest

#### 2. Remote Endpoint (Vercel)

```
Endpoint: https://egyptian-law-mcp.vercel.app/mcp
```

- Queries transit Vercel infrastructure
- Tool responses return through the same path
- Subject to Vercel's privacy policy

### What Gets Transmitted

When you use this Tool through an AI client:

- **Query Text**: Your search queries and tool parameters
- **Tool Responses**: Statute text (نصوص قانونية), provision content, search results
- **Metadata**: Timestamps, request identifiers

**What Does NOT Get Transmitted:**
- Files on your computer
- Your full conversation history (depends on AI client configuration)

---

## Professional Obligations (Egypt)

### Egyptian Bar Association Rules

Egyptian lawyers (المحامون) are bound by strict confidentiality rules under Law No. 17 of 1983 on Attorneys (قانون المحاماة) and the professional ethics standards of the Egyptian Bar Association (نقابة المحامين المصرية).

#### سرية المهنة (Professional Secrecy)

- All client communications are privileged under the Attorneys Law
- Client identity may be confidential in sensitive matters
- Case strategy and legal analysis are protected
- Information that could identify clients or matters must be safeguarded
- Breach of confidentiality may result in disciplinary proceedings (إجراءات تأديبية) and potential criminal liability under Article 310 of the Penal Code

### Egyptian Data Protection Law (Law No. 151 of 2020)

Under the **Egyptian Data Protection Law (Law No. 151 of 2020)** and its executive regulations, when using services that process client data:

- You are the **Data Controller** (المتحكم)
- AI service providers (Anthropic, Vercel) may be **Data Processors** (المعالج)
- A **Data Processing Agreement** may be required
- Ensure adequate technical and organizational measures
- Cross-border data transfer requires approval or adequate safeguards
- The Data Protection Center (مركز حماية البيانات الشخصية) oversees compliance

---

## Risk Assessment by Use Case

### LOW RISK: General Legal Research

**Safe to use through any deployment:**

```
Example: "What does Article 151 of the Egyptian Civil Code say about contractual obligations?"
```

- No client identity involved
- No case-specific facts
- Publicly available legal information

### MEDIUM RISK: Anonymized Queries

**Use with caution:**

```
Example: "What are the penalties for money laundering under Egyptian law?"
```

- Query pattern may reveal you are working on a money laundering matter
- Anthropic/Vercel logs may link queries to your API key

### HIGH RISK: Client-Specific Queries

**DO NOT USE through cloud AI services:**

- Remove ALL identifying details
- Use the local npm package with a self-hosted LLM
- Or use official legal databases with appropriate security controls
- Note: Cross-border data transfer restrictions under Law No. 151 of 2020 may apply

---

## Data Collection by This Tool

### What This Tool Collects

**Nothing.** This Tool:

- Does NOT log queries
- Does NOT store user data
- Does NOT track usage
- Does NOT use analytics
- Does NOT set cookies

The database is read-only. No user data is written to disk.

### What Third Parties May Collect

- **Anthropic** (if using Claude): Subject to [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- **Vercel** (if using remote endpoint): Subject to [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy)

---

## Recommendations

### For Solo Practitioners / Small Firms

1. Use local npm package for maximum privacy
2. General research: Cloud AI is acceptable for non-client queries
3. Client matters: Use official legal databases and professional resources

### For Large Firms / Corporate Legal

1. Negotiate Data Processing Agreements with AI service providers
2. Consider on-premise deployment with self-hosted LLM
3. Train staff on safe vs. unsafe query patterns
4. Ensure compliance with cross-border data transfer requirements under Law No. 151 of 2020

### For Government / Public Sector

1. Use self-hosted deployment, no external APIs
2. Follow Egyptian government IT security requirements
3. Air-gapped option available for classified matters
4. Ensure compliance with national data sovereignty requirements

---

## Questions and Support

- **Privacy Questions**: Open issue on [GitHub](https://github.com/Ansvar-Systems/Egyptian-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **Bar Guidance**: Consult the Egyptian Bar Association (نقابة المحامين المصرية) ethics guidance

---

**Last Updated**: 2026-02-22
**Tool Version**: 1.0.0
