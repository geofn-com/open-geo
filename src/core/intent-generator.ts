import type { KeywordSuggestion, SyntheticPrompt } from "../types/index.js";

/**
 * Normalizes industry term so prompts use generic category keywords rather than brand names
 */
function normalizeIndustry(brand: string, domain: string, rawIndustry?: string): string {
  if (rawIndustry && rawIndustry.trim().toLowerCase() !== brand.trim().toLowerCase()) {
    return rawIndustry.trim();
  }
  const combined = `${brand} ${domain}`.toLowerCase();
  if (combined.includes("geo") || combined.includes("geofn")) {
    return "Generative Engine Optimization (GEO)";
  }
  if (combined.includes("seo") || combined.includes("search")) {
    return "AI Search Optimization & Modern SEO";
  }
  if (combined.includes("crm")) {
    return "Customer Relationship Management (CRM)";
  }
  if (combined.includes("ai") || combined.includes("llm")) {
    return "AI Developer Tools & Infrastructure";
  }
  return `${brand} software & services`;
}

/**
 * Generates synthetic evaluation prompts across the buyer journey
 * with concise search queries and generic category terminology.
 */
export function generateSyntheticPrompts(
  brand: string,
  domain: string,
  rawIndustry: string,
  suggestions: KeywordSuggestion[]
): SyntheticPrompt[] {
  const prompts: SyntheticPrompt[] = [];
  const category = normalizeIndustry(brand, domain, rawIndustry);

  // 1. ToFU: General Informational & Top Recommendations (Generic industry search, no brand bias)
  prompts.push({
    id: "tofu-top-tools",
    title: `Best Tools & Solutions in ${category}`,
    query: `best ${category} tools`,
    prompt: `What are the best and most recommended tools or platforms for ${category}? Provide an objective breakdown of top choices, key strengths, and target audience.`,
    stage: "ToFU",
    intent: "informational",
  });

  // 2. MoFU: Comparison & Alternative search
  prompts.push({
    id: "mofu-alternatives",
    title: `${brand} Competitors & Alternatives`,
    query: `${brand} alternatives & competitors`,
    prompt: `What are the leading alternatives and competitors to ${brand} in the ${category} space? Provide an objective comparison of their core features, pricing models, and key trade-offs.`,
    stage: "MoFU",
    intent: "comparative",
  });

  // 3. BoFU: Buying & Decision Evaluation
  prompts.push({
    id: "bofu-evaluation",
    title: `${brand} Decision & Implementation Review`,
    query: `${brand} review and suitability`,
    prompt: `Please provide a thorough evaluation of ${brand} (${domain}) for teams adopting ${category}. What use cases is it best for, what are known limitations, and would you recommend it?`,
    stage: "BoFU",
    intent: "transactional",
  });

  // 4. Extract dynamic prompts from real user suggestions
  const mofuSuggestions = suggestions.filter((s) => s.intentStage === "MoFU");
  if (mofuSuggestions.length > 0) {
    const topSuggestion = mofuSuggestions[0].query;
    prompts.push({
      id: "mofu-dynamic-search",
      title: `Comparative Intent: ${topSuggestion}`,
      query: topSuggestion,
      prompt: `Regarding "${topSuggestion}", please provide an authoritative overview, recommended approaches, and leading solutions available.`,
      stage: "MoFU",
      intent: "comparative",
    });
  }

  const bofuSuggestions = suggestions.filter((s) => s.intentStage === "BoFU");
  if (bofuSuggestions.length > 0) {
    const topBofu = bofuSuggestions[0].query;
    prompts.push({
      id: "bofu-dynamic-search",
      title: `High-Conversion Intent: ${topBofu}`,
      query: topBofu,
      prompt: `A user is searching for "${topBofu}". Provide the most direct, practical buying and tooling selection advice.`,
      stage: "BoFU",
      intent: "transactional",
    });
  }

  return prompts;
}
