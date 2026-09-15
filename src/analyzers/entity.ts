import * as cheerio from "cheerio";
import type { EntityConsistencyReport, EntityVariant } from "../types/index.js";

/**
 * Normalizes text to compare base brand tokens
 */
function cleanToken(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Scans a target webpage to check brand entity consistency and drift across Title, H1, Schema and Body
 */
export async function auditEntityConsistency(
  targetUrl: string,
  providedBrand?: string,
  htmlContent?: string
): Promise<EntityConsistencyReport> {
  let html = htmlContent || "";

  if (!html) {
    try {
      const res = await fetch(targetUrl, {
        headers: { "User-Agent": "open-geo-entity-audit/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        html = await res.text();
      }
    } catch {
      // fallback
    }
  }

  const $ = cheerio.load(html);
  const domain = new URL(targetUrl).hostname.replace(/^www\./, "");
  const domainBase = domain.split(".")[0];

  // 1. Detect Brand Candidates from Title, H1, and JSON-LD
  const title = $("title").text().trim();
  const h1 = $("h1").first().text().trim();
  let schemaBrand = "";

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() || "");
      if (parsed.name) schemaBrand = String(parsed.name);
      else if (parsed.publisher?.name) schemaBrand = String(parsed.publisher.name);
    } catch {
      // ignore
    }
  });

  const canonicalBrand = providedBrand || schemaBrand || title.split(/[-|:]/)[0]?.trim() || domainBase;
  const canonicalClean = cleanToken(canonicalBrand);

  // 2. Scan for variants across text
  const variantMap = new Map<string, { count: number; locations: Set<string> }>();

  function recordVariant(str: string, location: string) {
    if (!str) return;
    const clean = cleanToken(str);
    if (clean === canonicalClean || clean === cleanToken(domainBase)) {
      const trimmed = str.trim();
      const existing = variantMap.get(trimmed) || { count: 0, locations: new Set() };
      existing.count += 1;
      existing.locations.add(location);
      variantMap.set(trimmed, existing);
    }
  }

  // Check Schema
  if (schemaBrand) recordVariant(schemaBrand, "json-ld");

  // Check Title
  title.split(/[-|:]/).forEach((part) => {
    if (cleanToken(part) === canonicalClean) recordVariant(part, "title");
  });

  // Check H1/H2
  $("h1, h2").each((_, el) => {
    const text = $(el).text();
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const single = words[i];
      const double = words.slice(i, i + 2).join(" ");
      if (cleanToken(single) === canonicalClean) recordVariant(single, "heading");
      if (cleanToken(double) === canonicalClean) recordVariant(double, "heading");
    }
  });

  // Check Body
  const bodyText = $("body").text();
  const bodyWords = bodyText.split(/\s+/);
  for (let i = 0; i < bodyWords.length; i++) {
    const single = bodyWords[i];
    const double = bodyWords.slice(i, i + 2).join(" ");
    if (cleanToken(single) === canonicalClean) recordVariant(single, "body");
    if (cleanToken(double) === canonicalClean) recordVariant(double, "body");
  }

  // If no variants matched from text scanning, ensure canonical exists
  if (variantMap.size === 0) {
    variantMap.set(canonicalBrand, { count: 1, locations: new Set(["inferred"]) });
  }

  const variants: EntityVariant[] = Array.from(variantMap.entries())
    .map(([variant, data]) => ({
      variant,
      count: data.count,
      locations: Array.from(data.locations),
    }))
    .sort((a, b) => b.count - a.count);

  const totalOccurrences = variants.reduce((sum, v) => sum + v.count, 0);
  const primaryVariant = variants[0];
  const pageConsistencyRate = Math.round((primaryVariant.count / totalOccurrences) * 100);

  let status: "perfect" | "minor-drift" | "severe-drift" | "unknown" = "perfect";
  if (variants.length > 2 && pageConsistencyRate < 75) {
    status = "severe-drift";
  } else if (variants.length > 1 && pageConsistencyRate < 95) {
    status = "minor-drift";
  }

  const recommendations: string[] = [];
  if (status === "severe-drift") {
    recommendations.push(
      `🚨 Fragmented Entity Warning: Multiple brand name variations detected (${variants.map((v) => `"${v.variant}"`).join(", ")}). Unify brand spelling across JSON-LD, H1, and body copy to prevent a 2.8x AI citation drop.`
    );
  } else if (status === "minor-drift") {
    recommendations.push(
      `💡 Minor Brand Drift: Primary brand name "${primaryVariant.variant}" is used ${pageConsistencyRate}% of the time, with minor variant "${variants[1]?.variant}". Consider standardizing.`
    );
  } else {
    recommendations.push("✅ Excellent Entity Consistency: Brand name is strictly uniform across all on-page elements.");
  }

  return {
    url: targetUrl,
    canonicalBrand,
    detectedBrand: primaryVariant.variant,
    pageConsistencyRate,
    status,
    variants,
    recommendations,
  };
}
