import * as cheerio from "cheerio";
import type { DiscoveryStackReport } from "../types/index.js";

async function probeUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "open-geo-discovery/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Audits a website's AI Discovery Stack protocols
 */
export async function auditDiscoveryStack(targetUrl: string): Promise<DiscoveryStackReport> {
  const urlObj = new URL(targetUrl);
  const base = urlObj.origin;

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
    fetch(targetUrl, {
      headers: { "User-Agent": "open-geo-discovery/1.0" },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null),
  ]);

  let jsonLd = false;
  let faqSchema = false;

  if (pageHtmlRes && pageHtmlRes.ok) {
    try {
      const html = await pageHtmlRes.text();
      const $ = cheerio.load(html);
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
  try {
    const robotsRes = await fetch(`${base}/robots.txt`, {
      headers: { "User-Agent": "open-geo-discovery/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (robotsRes.ok) {
      const text = await robotsRes.text();
      if (
        text.toLowerCase().includes("gptbot") ||
        text.toLowerCase().includes("claudebot") ||
        text.toLowerCase().includes("perplexitybot")
      ) {
        robotsTxtAiCrawlers = true;
      }
    }
  } catch {
    // robots not reachable
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
