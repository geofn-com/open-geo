import { getUnifiedSuggestions } from "../sources/suggest.js";
import { generateSyntheticPrompts } from "./intent-generator.js";
import { UniversalLLMProber } from "../probers/llm.js";
import { calculateGeoScorecard } from "./scorer.js";
import { auditWebpage } from "../crawler/audit.js";
import type { GeoScorecard, ProberResult } from "../types/index.js";

export interface ProbeOptions {
  brand: string;
  domain: string;
  industry?: string;
  keywords?: string[];
  model?: string;
}

/**
 * Executes single-model community GEO probe across buyer journey prompts
 * coupled with an automated lightweight technical audit of the target domain.
 */
export async function runCommunityProbe(options: ProbeOptions): Promise<GeoScorecard> {
  const {
    brand,
    domain,
    industry = brand,
    keywords = [industry],
    model,
  } = options;

  // 1. Kick off lightweight technical audit of target domain in parallel
  const targetUrl = domain.startsWith("http://") || domain.startsWith("https://")
    ? domain
    : `https://${domain}`;
  const auditPromise = auditWebpage(targetUrl).catch(() => undefined);

  // 2. Fetch free real search suggestions
  const suggestions = await getUnifiedSuggestions(keywords).catch(() => []);

  // 3. Synthesize buyer-journey evaluation prompts
  const prompts = generateSyntheticPrompts(brand, domain, industry, suggestions);

  // 4. Initialize single model prober
  const prober = new UniversalLLMProber(model ? { model } : undefined);

  // 5. Probe sequentially or in small batch
  const results: ProberResult[] = [];
  for (const prompt of prompts) {
    const res = await prober.probe(prompt, brand, domain);
    results.push(res);
  }

  // 6. Compute scorecard and attach technical audit report
  const scorecard = calculateGeoScorecard(brand, domain, results);
  const auditResult = await auditPromise;
  if (auditResult) {
    scorecard.audit = auditResult;
  }

  return scorecard;
}
