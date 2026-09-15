import type {
  BotAuditStatus,
  RobotsAuditReport,
  AiBotCategory,
} from "../types/index.js";

export interface BotDefinition {
  botName: string;
  userAgent: string;
  category: AiBotCategory;
  owner: string;
  recommendation: "allow" | "block" | "conditional";
  reason: string;
}

export const AI_BOT_DEFINITIONS: BotDefinition[] = [
  // 1. Search / Real-time Citation Bots (Recommended to ALLOW for GEO visibility)
  {
    botName: "PerplexityBot",
    userAgent: "PerplexityBot",
    category: "search",
    owner: "Perplexity AI",
    recommendation: "allow",
    reason: "Powers Perplexity search citations and answer synthesis",
  },
  {
    botName: "ClaudeBot",
    userAgent: "ClaudeBot",
    category: "search",
    owner: "Anthropic",
    recommendation: "allow",
    reason: "Powers Claude citations and web groundings",
  },
  {
    botName: "OAI-SearchBot",
    userAgent: "OAI-SearchBot",
    category: "search",
    owner: "OpenAI",
    recommendation: "allow",
    reason: "Powers ChatGPT Search & SearchGPT real-time web retrieval",
  },
  {
    botName: "ChatGPT-User",
    userAgent: "ChatGPT-User",
    category: "search",
    owner: "OpenAI",
    recommendation: "allow",
    reason: "On-demand user triggered browsing in ChatGPT",
  },
  {
    botName: "Googlebot",
    userAgent: "Googlebot",
    category: "search",
    owner: "Google",
    recommendation: "allow",
    reason: "Powers Google index and Google AI Overviews",
  },
  {
    botName: "Bingbot",
    userAgent: "Bingbot",
    category: "search",
    owner: "Microsoft",
    recommendation: "allow",
    reason: "Powers Bing search and Microsoft Copilot Grounding",
  },

  // 2. Training Bots (Often BLOCKED for IP & Zero-click defense)
  {
    botName: "CCBot",
    userAgent: "CCBot",
    category: "training",
    owner: "Common Crawl",
    recommendation: "block",
    reason: "Mass data hoarding for foundational AI training sets",
  },
  {
    botName: "Bytespider",
    userAgent: "Bytespider",
    category: "training",
    owner: "ByteDance",
    recommendation: "block",
    reason: "Aggressive scraper for Doubao/TikTok AI training",
  },
  {
    botName: "Amazonbot",
    userAgent: "Amazonbot",
    category: "training",
    owner: "Amazon",
    recommendation: "block",
    reason: "Amazon web scraper for Bedrock / Alexa training",
  },
  {
    botName: "FacebookBot",
    userAgent: "FacebookBot",
    category: "training",
    owner: "Meta",
    recommendation: "block",
    reason: "Meta LLaMA crawler",
  },
  {
    botName: "Applebot-Extended",
    userAgent: "Applebot-Extended",
    category: "training",
    owner: "Apple",
    recommendation: "conditional",
    reason: "Apple Intelligence training scraper",
  },

  // 3. Mixed / General LLM Crawlers
  {
    botName: "GPTBot",
    userAgent: "GPTBot",
    category: "mixed",
    owner: "OpenAI",
    recommendation: "conditional",
    reason: "OpenAI general crawler; controls GPT training index",
  },
  {
    botName: "Google-Extended",
    userAgent: "Google-Extended",
    category: "mixed",
    owner: "Google",
    recommendation: "conditional",
    reason: "Controls Gemini/Vertex AI training data collection",
  },
  {
    botName: "cohere-ai",
    userAgent: "cohere-ai",
    category: "training",
    owner: "Cohere",
    recommendation: "block",
    reason: "Cohere enterprise model training crawler",
  },
];

/**
 * Parses robots.txt content and checks rules for a specific User-Agent
 */
export function checkBotAllowedInRobots(
  robotsTxt: string,
  botUserAgent: string
): { allowed: boolean; ruleMatched?: string } {
  if (!robotsTxt || !robotsTxt.trim()) {
    return { allowed: true, ruleMatched: "Default (No robots.txt)" };
  }

  const lines = robotsTxt.split(/\r?\n/);
  let currentAgents: string[] = [];
  let inUserAgentBlock = false;
  let botSpecificRules: Array<{ type: "allow" | "disallow"; path: string }> = [];
  let wildcardRules: Array<{ type: "allow" | "disallow"; path: string }> = [];

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim(); // Strip comments
    if (!line) continue;

    const [directive, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const dirLower = directive.toLowerCase().trim();

    if (dirLower === "user-agent") {
      if (!inUserAgentBlock) {
        currentAgents = [];
        inUserAgentBlock = true;
      }
      currentAgents.push(value.toLowerCase());
    } else if (dirLower === "disallow" || dirLower === "allow") {
      inUserAgentBlock = false;
      const isDisallow = dirLower === "disallow";
      const ruleType = isDisallow ? "disallow" : "allow";

      for (const agent of currentAgents) {
        if (agent === botUserAgent.toLowerCase()) {
          botSpecificRules.push({ type: ruleType, path: value });
        } else if (agent === "*") {
          wildcardRules.push({ type: ruleType, path: value });
        }
      }
    } else {
      inUserAgentBlock = false;
    }
  }

  // 1. Evaluate bot-specific rules first
  if (botSpecificRules.length > 0) {
    const rootDisallow = botSpecificRules.find((r) => r.type === "disallow" && (r.path === "/" || r.path === ""));
    const rootAllow = botSpecificRules.find((r) => r.type === "allow" && (r.path === "/" || r.path === ""));

    if (rootDisallow && !rootAllow) {
      return { allowed: false, ruleMatched: `User-agent: ${botUserAgent} -> Disallow: /` };
    }
    if (rootAllow) {
      return { allowed: true, ruleMatched: `User-agent: ${botUserAgent} -> Allow: /` };
    }
    // If specific disallows exist for subpaths
    const anyDisallow = botSpecificRules.find((r) => r.type === "disallow");
    if (anyDisallow) {
      return { allowed: false, ruleMatched: `User-agent: ${botUserAgent} -> Disallow: ${anyDisallow.path}` };
    }
  }

  // 2. Evaluate wildcard rules fallback
  if (wildcardRules.length > 0) {
    const rootWildcardDisallow = wildcardRules.find(
      (r) => r.type === "disallow" && (r.path === "/" || r.path === "")
    );
    if (rootWildcardDisallow) {
      return { allowed: false, ruleMatched: "User-agent: * -> Disallow: /" };
    }
  }

  return { allowed: true, ruleMatched: "Allowed by default" };
}

/**
 * Audits a target website's robots.txt against 14 AI bot definitions and fatal GEO patterns
 */
export async function auditRobotsTxt(targetUrl: string): Promise<RobotsAuditReport> {
  const urlObj = new URL(targetUrl);
  const robotsUrl = `${urlObj.origin}/robots.txt`;

  let robotsContent = "";
  let contentSignalHeader: string | undefined;
  let robotsTxtFound = false;

  try {
    const res = await fetch(robotsUrl, {
      headers: {
        "User-Agent": "open-geo-audit/1.0",
        Accept: "text/plain, */*",
      },
    });

    if (res.ok) {
      robotsContent = await res.text();
      robotsTxtFound = true;
      contentSignalHeader = res.headers.get("content-signal") || undefined;
    }
  } catch {
    // If network error, treated as not found
  }

  const botMatrix: BotAuditStatus[] = AI_BOT_DEFINITIONS.map((def) => {
    const { allowed, ruleMatched } = checkBotAllowedInRobots(robotsContent, def.userAgent);
    return {
      botName: def.botName,
      userAgent: def.userAgent,
      category: def.category,
      owner: def.owner,
      allowed,
      ruleMatched,
      recommendation: def.recommendation,
      reason: def.reason,
    };
  });

  const allowedCount = botMatrix.filter((b) => b.allowed).length;
  const blockedCount = botMatrix.filter((b) => !b.allowed).length;

  const searchBots = botMatrix.filter((b) => b.category === "search" || b.category === "mixed");
  const trainingBots = botMatrix.filter((b) => b.category === "training");

  const searchBotsAllowedRate =
    searchBots.length > 0
      ? Math.round((searchBots.filter((b) => b.allowed).length / searchBots.length) * 100)
      : 100;

  const trainingBotsBlockedRate =
    trainingBots.length > 0
      ? Math.round((trainingBots.filter((b) => !b.allowed).length / trainingBots.length) * 100)
      : 0;

  // Fatal pattern checks
  const fatalPatterns = {
    allBlockedByWildcard: robotsContent.includes("User-agent: *\nDisallow: /") || robotsContent.includes("User-agent: *\r\nDisallow: /"),
    nextJsBundlesBlocked: robotsContent.includes("/_next/") || robotsContent.includes("/_nuxt/"),
    apiEndpointsBlocked: robotsContent.includes("/api/") && !robotsContent.includes("Allow: /api/"),
    sitemapMissing: !robotsContent.toLowerCase().includes("sitemap:"),
  };

  const recommendations: string[] = [];
  if (searchBotsAllowedRate < 100) {
    const blockedSearchBots = searchBots.filter((b) => !b.allowed).map((b) => b.botName);
    recommendations.push(
      `🚨 Critical GEO Risk: AI Search Bots are blocked (${blockedSearchBots.join(", ")}). Unblock them to restore citations in ChatGPT Search, Claude & Perplexity.`
    );
  }

  if (fatalPatterns.allBlockedByWildcard) {
    recommendations.push(
      "⚠️ Fatal Wildcard Block: 'Disallow: /' under '*' hides your entire domain from all discovery crawlers."
    );
  }

  if (fatalPatterns.nextJsBundlesBlocked) {
    recommendations.push(
      "💡 Potential Rendering Issue: Next.js/_next bundles are disallowed in robots.txt, preventing AI headless browsers from hydrating client-side content."
    );
  }

  if (fatalPatterns.sitemapMissing) {
    recommendations.push("💡 Best Practice: Add 'Sitemap: https://yourdomain.com/sitemap.xml' directive to robots.txt.");
  }

  return {
    url: targetUrl,
    robotsTxtFound,
    contentSignalHeader,
    totalBotsAudited: AI_BOT_DEFINITIONS.length,
    allowedCount,
    blockedCount,
    searchBotsAllowedRate,
    trainingBotsBlockedRate,
    fatalPatterns,
    botMatrix,
    recommendations,
  };
}
