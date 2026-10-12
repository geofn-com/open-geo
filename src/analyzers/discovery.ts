import * as cheerio from "cheerio";
import type { DiscoveryStackReport } from "../types/index.js";
import { normalizeUrl } from "../lib/url.js";
import { safeFetchText } from "../lib/http.js";

async function probeUrl(url: string): Promise<boolean> {
  const res = await safeFetchText(url, { timeoutMs: 5000 });
  return res.ok;
}

/**
 * Audits a website's AI Discovery Stack protocols
 */
export async function auditDiscoveryStack(rawTargetUrl: string): Promise<DiscoveryStackReport> {
  const targetUrl = normalizeUrl(rawTargetUrl);
  let base: string;
  try {
    const urlObj = new URL(targetUrl);
    base = urlObj.origin;
  } catch {
    base = targetUrl;
  }

  // Concurrent probing for AI protocol endpoints
  const [
    hasLlmsTxt,
    hasLlmsFullTxt,
    hasAgentsJson,
    hasMcpJson,
    hasAgentCard,
    hasSitemap,
    pageHtmlRes,
  ] = await Promise.all([
    probeUrl(`${base}/llms.txt`),
    probeUrl(`${base}/llms-full.txt`).then((ok) => (ok ? true : probeUrl(`${base}/llms-full.md`))),
    probeUrl(`${base}/.well-known/agents.json`).then((ok) => (ok ? true : probeUrl(`${base}/agents.json`))),
    probeUrl(`${base}/.well-known/mcp.json`).then((ok) => (ok ? true : probeUrl(`${base}/mcp.json`))),
    probeUrl(`${base}/.well-known/agent-card.json`),
    probeUrl(`${base}/sitemap.xml`),
    safeFetchText(targetUrl, { timeoutMs: 8000 }),
  ]);

  let jsonLd = false;
  let faqSchema = false;

  if (pageHtmlRes && pageHtmlRes.ok && pageHtmlRes.text) {
    try {
      const $ = cheerio.load(pageHtmlRes.text);
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const raw = $(el).html() || "";
          const parsed = JSON.parse(raw);
          jsonLd = true;
          const typeStr = JSON.stringify(parsed);
          if (typeStr.includes('"FAQPage"') || typeStr.includes('"Question"')) {
            faqSchema = true;
          }
        } catch {
          // invalid jsonld
        }
      });
    } catch {
      // html parsing error
    }
  }

  // Check robots.txt for AI crawlers
  let robotsTxtAiCrawlers = false;
  const robotsRes = await safeFetchText(`${base}/robots.txt`, { timeoutMs: 5000 });
  if (robotsRes.ok && robotsRes.text) {
    const text = robotsRes.text.toLowerCase();
    if (
      text.includes("gptbot") ||
      text.includes("claudebot") ||
      text.includes("perplexitybot")
    ) {
      robotsTxtAiCrawlers = true;
    }
  }

  // Weight Calculation:
  // llmsTxt (20), jsonLd (20), faqSchema (15), robotsTxtAiCrawlers (15), sitemap (10), agentsJson (10), mcpJson (5), agentCard (5)
  let score = 0;
  if (hasLlmsTxt) score += 20;
  if (jsonLd) score += 20;
  if (faqSchema) score += 15;
  if (robotsTxtAiCrawlers) score += 15;
  if (hasSitemap) score += 10;
  if (hasAgentsJson) score += 10;
  if (hasMcpJson) score += 5;
  if (hasAgentCard) score += 5;

  let rating: "excellent" | "good" | "fair" | "poor" = "poor";
  if (score >= 80) rating = "excellent";
  else if (score >= 60) rating = "good";
  else if (score >= 40) rating = "fair";

  const recommendations: string[] = [];
  if (!hasLlmsTxt) {
    recommendations.push("Deploy '/llms.txt' to provide concise AI markdown documentation for Cursor & LLM agents.");
  }
  if (!jsonLd) {
    recommendations.push("Implement Schema.org JSON-LD (SoftwareApplication / Organization / Product) on the homepage.");
  }
  if (!faqSchema) {
    recommendations.push("Add Schema.org 'FAQPage' JSON-LD to feed direct Q&A snippets into AI Overviews.");
  }
  if (!robotsTxtAiCrawlers) {
    recommendations.push("Explicitly configure User-agents in robots.txt (e.g., PerplexityBot, ClaudeBot).");
  }
  if (!hasAgentsJson && !hasMcpJson) {
    recommendations.push("Publish '/.well-known/agents.json' and '/mcp.json' to enable Agentic discovery & MCP tool interop.");
  }

  return {
    url: targetUrl,
    score,
    rating,
    stack: {
      llmsTxt: hasLlmsTxt,
      llmsFullTxt: hasLlmsFullTxt,
      agentsJson: hasAgentsJson,
      robotsTxtAiCrawlers,
      mcpJson: hasMcpJson,
      agentCard: hasAgentCard,
      jsonLd,
      sitemap: hasSitemap,
      faqSchema,
    },
    details: {
      llmsTxtUrl: hasLlmsTxt ? `${base}/llms.txt` : undefined,
      agentsJsonUrl: hasAgentsJson ? `${base}/.well-known/agents.json` : undefined,
      mcpJsonUrl: hasMcpJson ? `${base}/.well-known/mcp.json` : undefined,
      agentCardUrl: hasAgentCard ? `${base}/.well-known/agent-card.json` : undefined,
      sitemapUrl: hasSitemap ? `${base}/sitemap.xml` : undefined,
    },
    recommendations,
  };
}
