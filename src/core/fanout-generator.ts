import "../lib/env.js";
import { UniversalLLMProber } from "../probers/llm.js";
import { evaluateSearchSignal } from "../sources/suggest.js";
import type {
  FanoutInput,
  FanoutOutput,
  IntentGroup,
  QueryItem,
  CoverageReport,
} from "../types/index.js";

const DEFAULT_INTENT_LABELS = {
  informational: "Informational & Conceptual",
  commercial: "Commercial Research & Solutions",
  comparison: "Competitor & Alternative Comparison",
  transactional: "Pricing & Purchasing Decision",
  trust: "User Reviews & Community Trust",
};

/**
 * Generate Actionable Advice for a given intent & gap
 */
function getSuggestedAction(intent: string, query: string, brand?: string): string {
  switch (intent) {
    case "transactional":
      return `Build transparent pricing comparison and ROI calculation pages with FAQPage JSON-LD.`;
    case "comparison":
      return `Publish in-depth comparison articles (${brand || "Your Brand"} vs competitors), highlighting key differentiators.`;
    case "trust":
      return `Build authentic social proof and developer case studies on high-authority platforms (Reddit, G2, ProductHunt) for RAG retrieval.`;
    case "commercial":
      return `Optimize solution landing page (H1/H2 hierarchy and Product schema) to anchor niche category leadership.`;
    default:
      return `Publish authoritative technical guides or architectural whitepapers, linked in /llms.txt.`;
  }
}

/**
 * Core Query Fan-out Generation and Analysis Engine
 */
export async function analyzeQueryFanout(input: FanoutInput): Promise<FanoutOutput> {
  const {
    topic,
    domain,
    industry = topic,
    maxQueriesPerGroup = 4,
    probeDepth = "quick",
  } = input;

  const prober = new UniversalLLMProber({
    name: "Gemini-Fanout-Generator",
    model: "gemini-2.5-flash",
  });

  const promptText = `
You are a top Generative Engine Optimization (GEO) strategist.
Given the target topic "${topic}" in the category/industry "${industry}", simulate how an advanced AI Search Engine (like Perplexity or SearchGPT) would fan out and decompose this broad topic into realistic sub-queries across 5 intent stages.

Output strictly valid JSON matching this structure without any markdown backticks:
{
  "groups": [
    {
      "intent": "informational",
      "queries": ["query 1", "query 2"]
    },
    {
      "intent": "commercial",
      "queries": ["query 1", "query 2"]
    },
    {
      "intent": "comparison",
      "queries": ["query 1", "query 2"]
    },
    {
      "intent": "transactional",
      "queries": ["query 1", "query 2"]
    },
    {
      "intent": "trust",
      "queries": ["query 1", "query 2"]
    }
  ]
}

Constraints:
1. Provide exactly ${maxQueriesPerGroup} natural, diverse queries per intent group.
2. Queries must be domain-aware and specific to "${industry}" (DO NOT use generic templates like "for small business" if not relevant).
3. Output ONLY the JSON object.
`;

  let rawData: { groups: { intent: string; queries: string[] }[] } | null = null;

  try {
    const probeRes = await prober.probe(
      {
        id: "fanout-generation",
        title: "Fanout Subqueries Generation",
        prompt: promptText,
        stage: "ToFU",
        intent: "informational",
      },
      topic,
      domain || "example.com"
    );

    const firstBrace = probeRes.rawResponse.indexOf("{");
    const lastBrace = probeRes.rawResponse.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const jsonStr = probeRes.rawResponse.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.groups) && parsed.groups.length > 0) {
        rawData = parsed;
      } else {
        throw new Error("Invalid groups structure in response");
      }
    } else {
      throw new Error("No JSON object found in response");
    }
  } catch {
    // Fallback category-aware templates if LLM JSON parsing fails
    rawData = {
      groups: [
        {
          intent: "informational",
          queries: [
            `what is ${topic}`,
            `how does ${topic} work`,
            `complete guide to ${topic} 2026`,
            `${topic} key features`,
          ],
        },
        {
          intent: "commercial",
          queries: [
            `best ${topic} tools`,
            `top rated ${topic} solutions`,
            `enterprise ${topic} platform`,
            `${topic} for professionals`,
          ],
        },
        {
          intent: "comparison",
          queries: [
            `${topic} vs alternatives`,
            `${topic} competitor comparison`,
            `best open source ${topic}`,
            `pros and cons of ${topic}`,
          ],
        },
        {
          intent: "transactional",
          queries: [
            `${topic} pricing plans`,
            `${topic} cost breakdown`,
            `free trial for ${topic}`,
            `is ${topic} worth the money`,
          ],
        },
        {
          intent: "trust",
          queries: [
            `${topic} reviews and ratings`,
            `${topic} reddit discussions`,
            `${topic} real user feedback`,
            `is ${topic} legitimate and safe`,
          ],
        },
      ],
    };
  }

  const groups: IntentGroup[] = [];
  let totalQueries = 0;
  const queriesToProbe: { groupIndex: number; queryIndex: number; query: string }[] = [];

  // 1. Process intent groups & verify search signal concurrently via Suggest API
  for (const rawGroup of rawData?.groups || []) {
    const intentKey = (rawGroup.intent as keyof typeof DEFAULT_INTENT_LABELS) || "informational";
    const label = DEFAULT_INTENT_LABELS[intentKey] || intentKey;

    const queryItems: QueryItem[] = await Promise.all(
      (rawGroup.queries || []).map(async (q) => {
        const { signal, normalizedRoot } = await evaluateSearchSignal(q);

        // Prioritization logic: transactional & comparison queries have highest direct conversion impact
        let priority: "critical" | "high" | "medium" = "medium";
        if (intentKey === "transactional" || intentKey === "comparison") {
          priority = signal === "high" || signal === "medium" ? "critical" : "high";
        } else if (signal === "high") {
          priority = "high";
        }

        return {
          query: q,
          normalizedRoot,
          searchSignal: signal,
          priority,
          suggestedAction: getSuggestedAction(intentKey, q, domain),
        };
      })
    );

    totalQueries += queryItems.length;

    groups.push({
      intent: intentKey as any,
      label,
      queries: queryItems,
    });
  }

  // 2. If domain is provided, perform Brand Coverage Probing
  let coverage: CoverageReport | undefined = undefined;

  if (domain) {
    const brandName = domain.split(".")[0];
    let coveredCount = 0;
    let testedCount = 0;
    const criticalGaps: QueryItem[] = [];

    // Filter queries to probe based on depth
    const candidateQueries: QueryItem[] = [];
    for (const group of groups) {
      for (const qItem of group.queries) {
        if (probeDepth === "quick") {
          if (qItem.priority === "critical" || qItem.priority === "high") {
            candidateQueries.push(qItem);
          }
        } else {
          candidateQueries.push(qItem);
        }
      }
    }

    // Limit to max 8 probes concurrently to prevent rate limit
    const activeCandidates = candidateQueries.slice(0, 8);

    for (const qItem of activeCandidates) {
      testedCount++;
      const res = await prober.probe(
        {
          id: `fanout-probe-${testedCount}`,
          title: qItem.query,
          prompt: qItem.query,
          stage: "MoFU",
          intent: "comparative",
        },
        brandName,
        domain
      );

      qItem.brandMentioned = res.brandMentioned;
      qItem.mentionRank = res.mentionIndex;

      if (res.brandMentioned) {
        coveredCount++;
      } else {
        criticalGaps.push(qItem);
      }
    }

    const coverageRate = testedCount > 0 ? Math.round((coveredCount / testedCount) * 100) : 0;

    coverage = {
      domain,
      covered: coveredCount,
      total: testedCount,
      coverageRate,
      criticalGaps,
    };
  }

  return {
    topic,
    industry,
    totalQueries,
    groups,
    coverage,
  };
}
