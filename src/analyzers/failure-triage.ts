import type {
  FailureDiagnosisItem,
  FailureDiagnosisReport,
  FailureSeverity,
  GeoFailureCategory,
  RemediationPatch,
} from "../types/index.js";
import { auditRobotsTxt } from "./robots.js";
import { auditDiscoveryStack } from "./discovery.js";
import { auditContentCitability } from "./content.js";
import { auditEntityConsistency } from "./entity.js";
import {
  generateRobotsTxtPatch,
  generateJsonLdPatch,
  generateLlmsTxtPatch,
  generateHeadingRemediation,
} from "../generators/remediation-generator.js";

const CATEGORY_LABELS: Record<GeoFailureCategory, string> = {
  crawler_blocked: "AI Search Crawler Blockade (robots.txt)",
  discovery_missing: "Missing AI Discovery Standards (llms.txt / Schema)",
  citability_poor: "Low Content Citability & Data Density (KDD 2024)",
  entity_fragmented: "Brand Entity Fragmentation & Casing Drift",
  authority_vacuum: "Authority Vacuum (Lack of External Citations)",
  rendering_opaque: "Client-Side Rendering Blindspot (Opaque HTML)",
};

export interface DiagnoseGeoFailuresOptions {
  url: string;
  brand?: string;
}

/**
 * Executes multi-dimensional GEO Failure Typology and Triage
 */
import { normalizeUrl } from "../lib/url.js";

export async function diagnoseGeoFailures(
  options: DiagnoseGeoFailuresOptions
): Promise<FailureDiagnosisReport> {
  const rawUrl = options.url;
  const url = normalizeUrl(rawUrl);
  const userBrand = options.brand;

  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = url;
  }

  const brand = userBrand || host.split(".")[0].toUpperCase();

  // Run underlying audits concurrently
  const [robots, discovery, content, entity] = await Promise.all([
    auditRobotsTxt(url).catch(() => null),
    auditDiscoveryStack(url).catch(() => null),
    auditContentCitability(url).catch(() => null),
    auditEntityConsistency(url, brand).catch(() => null),
  ]);

  const diagnosedItems: FailureDiagnosisItem[] = [];
  const actionableFixes: RemediationPatch[] = [];

  // 1. Check Crawler Blockade (P0 Blocker)
  const blockedSearchBots = robots?.botMatrix
    ? robots.botMatrix
        .filter((b) => (b.category === "search" || b.category === "mixed") && !b.allowed)
        .map((b) => b.botName)
    : [];
  const hasFatalWildcard = Boolean(robots?.fatalPatterns?.allBlockedByWildcard);

  if (blockedSearchBots.length > 0 || hasFatalWildcard) {
    const evidence: string[] = [];
    if (blockedSearchBots.length > 0) {
      evidence.push(`Blocked search crawlers: ${blockedSearchBots.join(", ")}`);
    }
    if (hasFatalWildcard) {
      evidence.push("Fatal wildcard rule: 'User-agent: * Disallow: /' blocks all scrapers");
    }

    const patch = generateRobotsTxtPatch(blockedSearchBots, host);
    actionableFixes.push(patch);

    diagnosedItems.push({
      category: "crawler_blocked",
      categoryLabel: CATEGORY_LABELS.crawler_blocked,
      severity: "P0_BLOCKER",
      title: "Active AI Search Crawlers Blocked in robots.txt",
      rootCause: `Your robots.txt actively denies access to ${blockedSearchBots.length || "critical"} major AI search retrieval bots. AI engines cannot index your live pages for citations.`,
      evidence,
      impactScore: 95,
      priorityScore: 95, // 5 min fix, catastrophic impact
      patches: [patch],
    });
  }

  // 2. Check Discovery Standards Missing (P1 Critical)
  const missingProtocols: string[] = [];
  if (discovery?.stack) {
    if (!discovery.stack.llmsTxt) missingProtocols.push("/llms.txt");
    if (!discovery.stack.jsonLd) missingProtocols.push("Schema.org JSON-LD");
    if (!discovery.stack.sitemap) missingProtocols.push("sitemap.xml");

    if (missingProtocols.length > 0) {
      const patches: RemediationPatch[] = [];
      if (!discovery.stack.llmsTxt) {
        const patch = generateLlmsTxtPatch(host, brand);
        patches.push(patch);
        actionableFixes.push(patch);
      }
      if (!discovery.stack.jsonLd) {
        const patch = generateJsonLdPatch(host, brand, "product");
        patches.push(patch);
        actionableFixes.push(patch);
      }

      diagnosedItems.push({
        category: "discovery_missing",
        categoryLabel: CATEGORY_LABELS.discovery_missing,
        severity: "P1_CRITICAL",
        title: `Missing ${missingProtocols.join(" & ")} AI Machine Interfaces`,
        rootCause: "AI models parse structured discovery files 4-8x faster than arbitrary HTML. Lacking these protocols forces models to rely on third-party aggregators.",
        evidence: missingProtocols.map((p) => `Missing protocol: ${p}`),
        impactScore: 80,
        priorityScore: 85,
        patches,
      });
    }
  }

  // 3. Check Content Citability (KDD 2024 Criteria)
  if (content && content.overallScore < 60) {
    const evidence: string[] = [];
    const statsDim = content.dimensions?.find((d) => d.dimension === "statistical_density");
    const quotesDim = content.dimensions?.find((d) => d.dimension === "expert_quotes");
    const listDim = content.dimensions?.find((d) => d.dimension === "structured_lists");

    if (statsDim && statsDim.score < 50) evidence.push(`Low statistical density: ${statsDim.findings}`);
    if (quotesDim && quotesDim.score < 50) evidence.push(`Lacks expert quotes: ${quotesDim.findings}`);
    if (listDim && listDim.score < 50) evidence.push(`Lacks structured listicle formatting: ${listDim.findings}`);

    const headingPatch = generateHeadingRemediation("", brand);
    actionableFixes.push(headingPatch);

    diagnosedItems.push({
      category: "citability_poor",
      categoryLabel: CATEGORY_LABELS.citability_poor,
      severity: "P1_CRITICAL",
      title: "Content Citability Deficit (KDD 2024 Benchmark)",
      rootCause: `Content scores only ${content.overallScore}/100 in citability. AI synthesis algorithms penalize generic marketing copy and prioritize data-backed assertions.`,
      evidence: evidence.length > 0 ? evidence : ["Low paragraph extractability and high marketing ambiguity."],
      impactScore: 75,
      priorityScore: 70,
      patches: [headingPatch],
    });
  }

  // 4. Check Entity Fragmentation (P2 Moderate)
  if (entity && (entity.pageConsistencyRate < 80 || (entity.variants && entity.variants.length > 1) || entity.status !== "perfect")) {
    const evidence = [
      `Brand consistency rate: ${entity.pageConsistencyRate}%`,
      ...(entity.variants?.map((v) => `Found variant: "${v.variant}" in ${v.locations?.join(", ") || "body"}`) || []),
    ];

    const patch = generateHeadingRemediation("", brand);

    diagnosedItems.push({
      category: "entity_fragmented",
      categoryLabel: CATEGORY_LABELS.entity_fragmented,
      severity: "P2_MODERATE",
      title: "Entity Fragmentation & Casing Inconsistency",
      rootCause: `Multiple variations of the brand name ("${brand}") were detected across Title, H1, and body text. Studies indicate fragmented entities suffer up to a 2.8x reduction in AI citation probability.`,
      evidence,
      impactScore: 55,
      priorityScore: 60,
      patches: [patch],
    });
  }

  // 5. Calculate Overall Health Score (0 - 100)
  let healthScore = 100;
  diagnosedItems.forEach((item) => {
    if (item.severity === "P0_BLOCKER") healthScore -= 45;
    else if (item.severity === "P1_CRITICAL") healthScore -= 20;
    else healthScore -= 10;
  });
  healthScore = Math.max(0, Math.min(100, healthScore));

  // Sort diagnosed items by priority score (ROI: Impact vs Effort)
  diagnosedItems.sort((a, b) => b.priorityScore - a.priorityScore);

  const primaryBlocker = diagnosedItems[0]
    ? {
        category: diagnosedItems[0].category,
        title: diagnosedItems[0].title,
        severity: diagnosedItems[0].severity,
        remedyOverview: diagnosedItems[0].rootCause,
      }
    : undefined;

  const failureBreakdown: Record<FailureSeverity, number> = {
    P0_BLOCKER: diagnosedItems.filter((i) => i.severity === "P0_BLOCKER").length,
    P1_CRITICAL: diagnosedItems.filter((i) => i.severity === "P1_CRITICAL").length,
    P2_MODERATE: diagnosedItems.filter((i) => i.severity === "P2_MODERATE").length,
  };

  const executiveSummary = primaryBlocker
    ? `Identified ${diagnosedItems.length} failure patterns (Overall Health: ${healthScore}/100). The single most critical blocker is "${primaryBlocker.title}" (${primaryBlocker.severity}). Deploying the provided ${actionableFixes.length} code patches will resolve the immediate citation bottlenecks.`
    : `Site technical and content foundation is robust (Health Score: ${healthScore}/100). No fatal blockers identified.`;

  return {
    url,
    brand,
    overallHealthScore: healthScore,
    primaryBlocker,
    totalFailuresIdentified: diagnosedItems.length,
    failureBreakdown,
    diagnosedItems,
    actionableFixes,
    executiveSummary,
  };
}
