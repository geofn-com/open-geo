import { auditDiscoveryStack } from "./discovery.js";
import { auditRobotsTxt } from "./robots.js";
import { auditContentCitability } from "./content.js";
import { auditEntityConsistency } from "./entity.js";
import type { GeoSimulateReport } from "../types/index.js";
import { normalizeUrl } from "../lib/url.js";

/**
 * Zero-Token / No-Key GEO Score Simulator
 * Synthesizes Discovery Stack, Robots Crawlability, Content Citability, and Entity Consistency.
 */
export async function simulateGeoScore(
  rawTargetUrl: string,
  brandName?: string
): Promise<GeoSimulateReport> {
  const targetUrl = normalizeUrl(rawTargetUrl);
  const domain = new URL(targetUrl).hostname.replace(/^www\./, "");

  // Run all zero-token analyzers concurrently
  const [discovery, robots, content, entity] = await Promise.all([
    auditDiscoveryStack(targetUrl),
    auditRobotsTxt(targetUrl),
    auditContentCitability(targetUrl),
    auditEntityConsistency(targetUrl, brandName),
  ]);

  // 1. Calculate Sub-Scores (0 - 100)
  const discoveryStackScore = discovery.score;
  const contentQualityScore = content.overallScore;

  // Citation Strength: Content citability (60%) + Robots Search Bots access (40%)
  const citationStrength = Math.round(
    contentQualityScore * 0.6 + robots.searchBotsAllowedRate * 0.4
  );

  // Brand Awareness: Entity consistency rate (70%) + Schema presence (30%)
  const brandAwareness = Math.round(
    entity.pageConsistencyRate * 0.7 + (discovery.stack.jsonLd ? 30 : 0)
  );

  // Share of Voice: Discovery stack (40%) + Robots accessibility (60%)
  const shareOfVoice = Math.round(
    discoveryStackScore * 0.4 + robots.searchBotsAllowedRate * 0.6
  );

  // Sentiment baseline estimation
  const sentiment = 65;

  // 2. Compute Weighted Overall Estimated GEO Score
  const subScores = {
    brandAwareness,
    citationStrength,
    shareOfVoice,
    sentiment,
    discoveryStack: discoveryStackScore,
    contentQuality: contentQualityScore,
  };

  const estimatedScore = Math.round(
    discoveryStackScore * 0.25 +
      contentQualityScore * 0.25 +
      citationStrength * 0.2 +
      brandAwareness * 0.15 +
      shareOfVoice * 0.15
  );

  let confidence: "high" | "medium" | "low" = "medium";
  if (robots.robotsTxtFound && content.wordCount > 300) {
    confidence = "high";
  } else if (!robots.robotsTxtFound && content.wordCount < 100) {
    confidence = "low";
  }

  // 3. Compile Key Findings & Recommendations
  const keyFindings: string[] = [
    `AI Discovery Stack Score: ${discovery.score}/100 (${discovery.rating})`,
    `Robots.txt AI Crawlers: ${robots.allowedCount}/${robots.totalBotsAudited} allowed (${robots.searchBotsAllowedRate}% search bot access)`,
    `Content Citability Depth: ${content.overallScore}/100 (~${content.wordCount} words, type: ${content.pageType.type})`,
    `Entity Uniformity: ${entity.pageConsistencyRate}% consistent (${entity.status})`,
  ];

  const recommendations: string[] = [
    ...discovery.recommendations.slice(0, 2),
    ...robots.recommendations.slice(0, 2),
    ...content.topRecommendations.slice(0, 2).map((r) => `${r.advice} (${r.geoReference})`),
    ...entity.recommendations.slice(0, 1),
  ];

  return {
    url: targetUrl,
    domain,
    estimatedScore,
    confidence,
    subScores,
    keyFindings,
    recommendations,
  };
}
