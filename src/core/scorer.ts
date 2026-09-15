import type { GeoScorecard, ProberResult } from "../types/index.js";

/**
 * Calculates unified GEO Scorecard from probe results
 */
export function calculateGeoScorecard(
  brand: string,
  domain: string,
  results: ProberResult[]
): GeoScorecard {
  const totalProbes = results.length;
  if (totalProbes === 0) {
    return {
      brand,
      domain,
      totalProbes: 0,
      visibilityScore: 0,
      citationShare: 0,
      top3RecommendationRate: 0,
      knowledgeGaps: [],
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0, none: 0 },
      modelPerformance: {},
      results: [],
    };
  }

  let mentionCount = 0;
  let top3Count = 0;
  let totalCitations = 0;
  let brandCitations = 0;

  const sentimentBreakdown = {
    positive: 0,
    neutral: 0,
    negative: 0,
    none: 0,
  };

  const knowledgeGaps: string[] = [];
  const modelPerformance: GeoScorecard["modelPerformance"] = {};

  for (const res of results) {
    // Model stats init
    if (!modelPerformance[res.model]) {
      modelPerformance[res.model] = {
        mentionedCount: 0,
        total: 0,
        citationCount: 0,
        avgMentionRank: 0,
      };
    }
    modelPerformance[res.model].total += 1;

    if (res.brandMentioned) {
      mentionCount += 1;
      modelPerformance[res.model].mentionedCount += 1;

      if (res.mentionIndex >= 0 && res.mentionIndex < 3) {
        top3Count += 1;
      }
    } else {
      const gapQuery = res.query || res.promptText;
      if (!knowledgeGaps.includes(gapQuery)) {
        knowledgeGaps.push(gapQuery);
      }
    }

    sentimentBreakdown[res.sentiment] += 1;

    totalCitations += res.citedUrls.length;
    if (res.brandDomainCited) {
      brandCitations += 1;
      modelPerformance[res.model].citationCount += 1;
    }
  }

  // Calculate Visibility Score (0-100)
  // Formula: 60% Mention Rate + 25% Top3 Rate + 15% Citation Share
  const mentionRate = (mentionCount / totalProbes) * 100;
  const top3Rate = (top3Count / totalProbes) * 100;
  const citationShare =
    totalCitations > 0 ? (brandCitations / totalCitations) * 100 : 0;

  const visibilityScore = Math.round(
    mentionRate * 0.6 + top3Rate * 0.25 + citationShare * 0.15
  );

  return {
    brand,
    domain,
    totalProbes,
    visibilityScore: Math.min(100, Math.max(0, visibilityScore)),
    citationShare: Math.round(citationShare),
    top3RecommendationRate: Math.round(top3Rate),
    knowledgeGaps,
    sentimentBreakdown,
    modelPerformance,
    results,
  };
}
