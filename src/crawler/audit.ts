import * as cheerio from "cheerio";
import type { TechnicalAuditReport } from "../types/index.js";
import { checkBotAllowedInRobots } from "../analyzers/robots.js";
import { USER_AGENT as DEFAULT_USER_AGENT } from "../lib/version.js";

/**
 * Perform deep local semantic & technical audit of a webpage for GEO readiness
 */
export async function auditWebpage(targetUrl: string): Promise<TechnicalAuditReport> {
  const parsedUrl = new URL(targetUrl);
  const origin = parsedUrl.origin;

  const recommendations: string[] = [];
  let score = 100;

  // 1. Fetch HTML page with 10s timeout
  let html = "";
  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    html = await res.text();
  } catch (err: any) {
    return {
      url: targetUrl,
      timestamp: new Date().toISOString(),
      score: 0,
      llmsTxt: { hasLlmsTxt: false, hasLlmsFullTxt: false, details: "Webpage inaccessible" },
      schemaMarkup: { hasJsonLd: false, schemaTypes: [], details: "Webpage inaccessible" },
      headings: { h1Count: 0, h2Count: 0, hierarchyValid: false },
      meta: { openGraph: {} },
      aiCrawlability: { allowsAiBots: false, robotsTxtStatus: "Failed", blockedBots: [] },
      recommendations: [`Failed to fetch webpage: ${err.message}`],
    };
  }

  const $ = cheerio.load(html);

  // 2. Headings hierarchy
  const h1Elements = $("h1");
  const h1Count = h1Elements.length;
  const h2Count = $("h2").length;
  let hierarchyValid = true;

  if (h1Count === 0) {
    score -= 15;
    hierarchyValid = false;
    recommendations.push("Missing primary <h1> heading tag. AI web extractors require <h1> to anchor primary topics.");
  } else if (h1Count > 1) {
    score -= 5;
    recommendations.push("Multiple <h1> tags detected. Recommend using exactly one <h1> to focus semantic entity weight.");
  }

  // 3. Meta & OpenGraph
  const title = $("title").text().trim();
  const description = $('meta[name="description"]').attr("content")?.trim();
  const canonical = $('link[rel="canonical"]').attr("href")?.trim();
  
  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property");
    const content = $(el).attr("content");
    if (prop && content) {
      openGraph[prop] = content;
    }
  });

  if (!description) {
    score -= 10;
    recommendations.push("Missing meta description. Reduces citation snippet accuracy in AI search answer cards.");
  }

  // 4. Schema.org / JSON-LD Markup
  const schemaTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "{}");
      if (json["@type"]) {
        schemaTypes.push(json["@type"]);
      }
      if (Array.isArray(json["@graph"])) {
        json["@graph"].forEach((item: any) => {
          if (item["@type"]) schemaTypes.push(item["@type"]);
        });
      }
    } catch {
      // ignore invalid json
    }
  });

  const hasJsonLd = schemaTypes.length > 0;
  if (!hasJsonLd) {
    score -= 20;
    recommendations.push("No Schema.org JSON-LD detected (Organization, Product, FAQPage). Strongly recommended for LLM knowledge graph grounding.");
  }

  // 5. Check llms.txt & llms-full (.txt or .md) at root
  let hasLlmsTxt = false;
  let hasLlmsFullTxt = false;
  try {
    const llmsRes = await fetch(`${origin}/llms.txt`, {
      headers: { "User-Agent": DEFAULT_USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    hasLlmsTxt = llmsRes.ok;

    const [llmsFullTxtRes, llmsFullMdRes] = await Promise.all([
      fetch(`${origin}/llms-full.txt`, {
        headers: { "User-Agent": DEFAULT_USER_AGENT },
        signal: AbortSignal.timeout(6000),
      }).catch(() => null),
      fetch(`${origin}/llms-full.md`, {
        headers: { "User-Agent": DEFAULT_USER_AGENT },
        signal: AbortSignal.timeout(6000),
      }).catch(() => null),
    ]);
    hasLlmsFullTxt = Boolean(llmsFullTxtRes?.ok || llmsFullMdRes?.ok);
  } catch {
    // ignore
  }

  if (!hasLlmsTxt) {
    score -= 15;
    recommendations.push(
      `No /llms.txt found at domain root. Run 'open-geo generate-llms ${targetUrl} --full' to synthesize and deploy llmstxt.org v2 standard files.`
    );
  }

  // 6. Check robots.txt for AI bots using state-machine parser
  const blockedBots: string[] = [];
  let allowsAiBots = true;
  let robotsTxtStatus = "OK";
  try {
    const robotsRes = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": DEFAULT_USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (robotsRes.ok) {
      const robotsText = await robotsRes.text();
      const aiBots = ["GPTBot", "OAI-SearchBot", "PerplexityBot", "ClaudeBot", "Google-Extended"];
      for (const bot of aiBots) {
        const check = checkBotAllowedInRobots(robotsText, bot);
        if (!check.allowed) {
          blockedBots.push(bot);
        }
      }
      if (blockedBots.length > 0) {
        allowsAiBots = false;
        score -= 20;
        recommendations.push(`robots.txt blocks critical AI search bots (${blockedBots.join(", ")}), directly preventing LLM grounding citations.`);
      }
    }
  } catch {
    robotsTxtStatus = "Unavailable";
  }

  score = Math.max(0, Math.min(100, score));

  return {
    url: targetUrl,
    timestamp: new Date().toISOString(),
    score,
    llmsTxt: {
      hasLlmsTxt,
      hasLlmsFullTxt,
      url: hasLlmsTxt ? `${origin}/llms.txt` : undefined,
      details: hasLlmsTxt ? "✅ Standard /llms.txt deployed" : "❌ Missing /llms.txt specification",
    },
    schemaMarkup: {
      hasJsonLd,
      schemaTypes,
      details: hasJsonLd ? `✅ Detected Schema types: ${schemaTypes.join(", ")}` : "❌ Missing JSON-LD structured data",
    },
    headings: {
      h1Count,
      h2Count,
      hierarchyValid,
    },
    meta: {
      title,
      description,
      openGraph,
      canonical,
    },
    aiCrawlability: {
      allowsAiBots,
      robotsTxtStatus,
      blockedBots,
    },
    recommendations,
  };
}
