import * as cheerio from "cheerio";
import type { TechnicalAuditReport } from "../types/index.js";
import { checkBotAllowedInRobots, CRITICAL_SEARCH_BOTS, MIXED_TRAINING_BOTS } from "../analyzers/robots.js";
import { normalizeUrl } from "../lib/url.js";
import { safeFetchText } from "../lib/http.js";

/**
 * Perform deep local semantic & technical audit of a webpage for GEO readiness
 */
export async function auditWebpage(rawTargetUrl: string): Promise<TechnicalAuditReport> {
  const targetUrl = normalizeUrl(rawTargetUrl);
  let origin = "";
  try {
    const parsedUrl = new URL(targetUrl);
    origin = parsedUrl.origin;
  } catch {
    origin = targetUrl;
  }

  const recommendations: string[] = [];
  let score = 100;

  // 1. Fetch HTML page with 10s timeout using safeFetchText
  const htmlFetch = await safeFetchText(targetUrl, { timeoutMs: 10000 });
  if (!htmlFetch.ok || !htmlFetch.text) {
    return {
      url: targetUrl,
      timestamp: new Date().toISOString(),
      score: 0,
      llmsTxt: { hasLlmsTxt: false, hasLlmsFullTxt: false, details: "Webpage inaccessible" },
      schemaMarkup: { hasJsonLd: false, schemaTypes: [], details: "Webpage inaccessible", deliveryMethod: "none" },
      headings: { h1Count: 0, h2Count: 0, hierarchyValid: false },
      meta: { openGraph: {} },
      aiCrawlability: { allowsAiBots: false, robotsTxtStatus: "Failed", blockedBots: [] },
      recommendations: [`Failed to fetch webpage: ${htmlFetch.error || "Webpage inaccessible"}`],
    };
  }

  const html = htmlFetch.text;

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

  let hasJsonLd = schemaTypes.length > 0;
  let deliveryMethod: "static" | "dynamic_rsc" | "dynamic_js" | "none" = hasJsonLd ? "static" : "none";
  let schemaDetails = "";

  if (hasJsonLd) {
    schemaDetails = `✅ Detected Schema types (Static HTML): ${schemaTypes.join(", ")}`;
  } else {
    // Heuristic detection: check for Next.js RSC streaming payloads or inline script payloads containing schema.org
    const isRscStream = /__next_f|self\.__next_f|_rsc=/i.test(html);
    const hasSchemaOrgMarker = /schema\.org/i.test(html);

    if (hasSchemaOrgMarker) {
      const typeRegex = /@type[\"\\]*:\s*[\"\\]*([A-Za-z0-9_]+)/g;
      const detectedTypes = new Set<string>();
      let match;
      while ((match = typeRegex.exec(html)) !== null) {
        const t = match[1];
        if (t && !["null", "undefined", "true", "false", "string", "number", "boolean"].includes(t.toLowerCase())) {
          detectedTypes.add(t);
        }
      }

      if (detectedTypes.size > 0) {
        hasJsonLd = true;
        deliveryMethod = isRscStream ? "dynamic_rsc" : "dynamic_js";
        schemaTypes.push(...Array.from(detectedTypes));
        // Minor penalty (-5 instead of -20) due to dynamic execution risk for non-JS AI crawlers
        score -= 5;
        const frameworkName = isRscStream ? "Next.js RSC stream payload" : "dynamic client script";
        schemaDetails = `⚠️ Detected in ${frameworkName}: ${schemaTypes.join(", ")} (AI Crawler Risk: non-JS bots may not execute dynamic streams)`;
        recommendations.push(
          `⚠️ Schema.org is embedded in dynamic ${frameworkName} rather than root <script type="application/ld+json">. Major AI search crawlers (GPTBot, PerplexityBot) do not execute JavaScript; render JSON-LD statically in root layout to guarantee indexing.`
        );
      }
    }

    if (!hasJsonLd) {
      deliveryMethod = "none";
      score -= 20;
      schemaDetails = "❌ Missing JSON-LD structured data";
      recommendations.push(
        "No Schema.org JSON-LD detected (Organization, Product, FAQPage). Strongly recommended for LLM knowledge graph grounding."
      );
    }
  }

  // 5. Check llms.txt & llms-full (.txt or .md) at root
  let hasLlmsTxt = false;
  let hasLlmsFullTxt = false;
  try {
    const llmsRes = await safeFetchText(`${origin}/llms.txt`, { timeoutMs: 6000 });
    hasLlmsTxt = llmsRes.ok;

    const [llmsFullTxtRes, llmsFullMdRes] = await Promise.all([
      safeFetchText(`${origin}/llms-full.txt`, { timeoutMs: 6000 }),
      safeFetchText(`${origin}/llms-full.md`, { timeoutMs: 6000 }),
    ]);
    hasLlmsFullTxt = Boolean(llmsFullTxtRes.ok || llmsFullMdRes.ok);
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
  const robotsRes = await safeFetchText(`${origin}/robots.txt`, { timeoutMs: 6000 });
  if (robotsRes.ok && robotsRes.text) {
    const robotsText = robotsRes.text;
    const blockedSearchBots: string[] = [];
    const blockedMixedBots: string[] = [];

    for (const bot of CRITICAL_SEARCH_BOTS) {
      const check = checkBotAllowedInRobots(robotsText, bot);
      if (!check.allowed) {
        blockedSearchBots.push(bot);
        blockedBots.push(bot);
      }
    }

    for (const bot of MIXED_TRAINING_BOTS) {
      const check = checkBotAllowedInRobots(robotsText, bot);
      if (!check.allowed) {
        blockedMixedBots.push(bot);
        blockedBots.push(bot);
      }
    }

    if (blockedSearchBots.length > 0) {
      allowsAiBots = false;
      score -= 20;
      recommendations.push(
        `robots.txt blocks critical AI search retrieval bots (${blockedSearchBots.join(", ")}), directly preventing real-time LLM grounding and citation.`
      );
    } else if (blockedMixedBots.length > 0) {
      score -= 5;
      recommendations.push(
        `robots.txt blocks foundation model training crawlers (${blockedMixedBots.join(", ")}). Live search bots (OAI-SearchBot/PerplexityBot) remain allowed.`
      );
    }
  } else {
    robotsTxtStatus = robotsRes.error ? "Fetch Error" : "Unavailable";
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
      details: schemaDetails,
      deliveryMethod,
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
