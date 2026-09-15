# 🚀 open-geo

> **Open-source, AI-Native Generative Engine Optimization (GEO) & Technical Audit Suite.**  
> Like Lighthouse for Google SEO, `open-geo` is the open standard toolkit for Generative Engine Optimization (ChatGPT Search, Perplexity, Google AIO, Claude).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%2B-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)

---

## ⚡ Quick Start (No Installation Required)

Audit any website in seconds directly via `npx`:

```bash
# 🛠️ Audit your website's GEO readiness (robots.txt, llms.txt, Schema.org, AI crawlability)
npx open-geo audit https://yourdomain.com

# 📑 Generate standard /llms.txt and /llms-full.md specifications
npx open-geo generate-llms https://yourdomain.com --full

# ❓ Extract FAQs & generate Schema.org FAQPage JSON-LD
npx open-geo generate-faq https://yourdomain.com

# 🔑 Mine real-time buyer-intent keywords from Google & Bing
npx open-geo keywords "best crm for startups"

# 🌐 Decompose 5-dimensional Query Fan-out intents
npx open-geo fanout "ai video generator" --domain yourdomain.com

# 🔍 Probe single-model AI visibility & buyer-funnel awareness (zero-token heuristic or live LLM)
npx open-geo probe "yourbrand" -d yourdomain.com

# 🔌 Start local Model Context Protocol (MCP) Server for Cursor & Claude Code
npx open-geo mcp
```

### ⚙️ Environment Configuration (Optional)

`open-geo` works out-of-the-box with zero configuration for static technical audits. For live single-model LLM probing (`open-geo probe`), simply configure your preferred provider's API key:

```bash
cp .env.example .env
# Recommended: Set OPENROUTER_API_KEY for 100+ models with 1 key (or direct GEMINI_API_KEY / DEEPSEEK_API_KEY)
```

---

## 🌟 Core Features (Community Edition)

* **🛠️ Zero-Token Technical Health Audit**: Instant assessment of `robots.txt` AI search bot whitelisting (PerplexityBot, ClaudeBot, GPTBot, OAI-SearchBot, Google-Extended), Schema.org entity integrity, and title hierarchies.
* **📑 Standard `/llms.txt` & `/llms-full.md` Generator**: Auto-crawl website navigation and produce high-density, markdown-first documentation designed for LLM RAG agents.
* **🏷️ Schema.org & FAQ Synthesis**: Automatically extract buyer Q&As and generate compliant JSON-LD structured data snippet patches for immediate CMS injection.
* **⚡ KDD 2024 Citability & Retrieval Quality**: Audit page Text-to-HTML ratio, client-side rendering (CSR) risks, canonical compliance, and content freshness signals.
* **🔌 Native MCP Server (8 Tools)**: Connect seamlessly with Cursor, Claude Code, and Codex to diagnose and fix GEO issues during active development.

---

## ⚖️ Community Edition vs Commercial SaaS (geofn.com)

`open-geo` is built on an **Open-Core** architecture. The community edition provides free, zero-marginal-cost technical diagnostic tools for individual developers. For enterprise teams and digital agencies requiring multi-model concurrent benchmarks and continuous monitoring, visit **[geofn.com](https://geofn.com)**.

| Dimension | 🌐 open-geo (MIT Open Source) | 🔒 [geofn.com](https://geofn.com) (Commercial SaaS) |
| :--- | :--- | :--- |
| **Technical Audit** | ✅ Single-URL instant static audit & patches | 🔒 Full-site automated crawl & dynamic property drift alerts |
| **AI Visibility Probing** | ✅ Single-model AI visibility probing (Developer-friendly, offline fallback) | 🔒 **4-Engine Concurrent Matrix** (ChatGPT + Perplexity + Google AIO + Gemini) with managed proxy pool & zero API setup |
| **Remediation** | ✅ Standardized static templates (`robots.txt`, JSON-LD) | 🔒 **Dynamic Competitor Entity Gap Diff** ("Why AI cited your competitor instead of you") |
| **Monitoring** | ✅ Point-in-time single run snapshot | 🔒 **24/7 AI Citation Drift Tracking** with Slack/Email alerts |
| **Fulfillment** | ✅ Developer CLI terminal & raw Markdown | 🔒 **White-label Agency Portal & Executive Pitch PDF Proposals** |

👉 **[Learn more about Commercial SaaS on geofn.com →](https://geofn.com)**

---

## 🔌 Using with Cursor & Claude Code (MCP)

Recommended: install globally for instant startup:
```bash
npm install -g open-geo
```

Add to your `claude_desktop_config.json` or Cursor MCP settings:

```json
{
  "mcpServers": {
    "open-geo": {
      "command": "open-geo",
      "args": ["mcp"]
    }
  }
}
```

Or via `npx` without installation:

```json
{
  "mcpServers": {
    "open-geo": {
      "command": "npx",
      "args": ["-y", "open-geo", "mcp"]
    }
  }
}
```

Once connected, your AI assistant can invoke all 8 native MCP tools:
* `geo_diagnose_failure`: Diagnose root-cause GEO failures (AI crawler blockades, missing discovery standards, entity fragmentation) and generate actionable code patches.
* `geo_audit_webpage`: Comprehensive technical readiness audit for HTML structure, Schema.org, llms.txt, and AI crawler whitelisting.
* `geo_generate_llms`: Crawl site navigation and generate standard `/llms.txt` and `/llms-full.md` for LLM RAG agents.
* `geo_generate_faq`: Extract core Q&As and generate Schema.org `FAQPage` JSON-LD from URL or raw text.
* `geo_retrieval_quality`: Audit page Text-to-HTML ratio, client-side rendering (CSR) risk, and Canonical tag compliance.
* `geo_content_freshness`: Audit page publishing date, modification timestamp, and Schema.org `dateModified` freshness signals.
* `geo_simulate_score`: Zero-token local heuristic estimation of overall GEO score (0-100) synthesizing discovery stack, robots accessibility, citability, and entity consistency.
* `geo_suggest_keywords`: Mine real-time Google & Bing search suggestions and intent stages (ToFU/MoFU/BoFU).

---

## 🤝 Contributing & License

Contributions are welcome! Please feel free to submit a Pull Request.

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
