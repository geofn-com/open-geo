import * as cheerio from "cheerio";
import type { ContentFreshnessReport, FreshnessPageItem } from "../types/index.js";

export interface AuditContentFreshnessOptions {
  url: string;
  maxPages?: number;
  mockPages?: FreshnessPageItem[];
}

/**
 * Parses XML sitemap to extract URLs and lastmod timestamps
 */
function parseSitemapUrls(xmlText: string, maxPages: number): FreshnessPageItem[] {
  const items: FreshnessPageItem[] = [];
  const $ = cheerio.load(xmlText, { xmlMode: true });
  const now = Date.now();

  $("url").each((_, el) => {
    if (items.length >= maxPages) return;
    const loc = $(el).find("loc").text().trim();
    const lastmod = $(el).find("lastmod").text().trim();

    if (loc) {
      let ageInDays = 30;
      if (lastmod) {
        const parsedDate = new Date(lastmod).getTime();
        if (!isNaN(parsedDate)) {
          ageInDays = Math.max(0, Math.round((now - parsedDate) / (1000 * 3600 * 24)));
        }
      }

      let status: "fresh" | "moderate" | "stale" = "moderate";
      if (ageInDays <= 30) status = "fresh";
      else if (ageInDays > 180) status = "stale";

      items.push({
        url: loc,
        lastModified: lastmod || undefined,
        ageInDays,
        status,
        source: "sitemap_lastmod",
      });
    }
  });

  return items;
}

/**
 * Audits Sitemap-First Content Freshness across multiple metadata sources
 */
export async function auditContentFreshness(
  options: AuditContentFreshnessOptions | string
): Promise<ContentFreshnessReport> {
  const targetUrl = typeof options === "string" ? options : options.url;
  const maxPages = typeof options === "object" ? options.maxPages || 15 : 15;
  const mockPages = typeof options === "object" ? options.mockPages : undefined;

  const urlObj = new URL(targetUrl);
  const domain = urlObj.hostname.replace(/^www\./, "");
  const sitemapUrl = `${urlObj.origin}/sitemap.xml`;

  let pages: FreshnessPageItem[] = mockPages ? [...mockPages] : [];

  if (pages.length === 0) {
    // 1. Try sitemap.xml first
    try {
      const sitemapRes = await fetch(sitemapUrl, {
        headers: { "User-Agent": "open-geo-freshness/1.0" },
        signal: AbortSignal.timeout(6000),
      });

      if (sitemapRes.ok) {
        const xmlText = await sitemapRes.text();
        pages = parseSitemapUrls(xmlText, maxPages);
      }
    } catch {
      // fallback
    }

    // 2. If no sitemap pages found, inspect the target page directly
    if (pages.length === 0) {
      try {
        const pageRes = await fetch(targetUrl, {
          headers: { "User-Agent": "open-geo-freshness/1.0" },
          signal: AbortSignal.timeout(8000),
        });

        const lastModifiedHeader = pageRes.headers.get("last-modified");
        let detectedDate: string | undefined = lastModifiedHeader || undefined;
        let source: "sitemap_lastmod" | "http_header" | "og_meta" | "schema_date" = "http_header";

        if (pageRes.ok) {
          const html = await pageRes.text();
          const $ = cheerio.load(html);

          const ogTime =
            $('meta[property="og:updated_time"]').attr("content") ||
            $('meta[property="article:modified_time"]').attr("content") ||
            $('meta[name="revised"]').attr("content");

          if (ogTime) {
            detectedDate = ogTime;
            source = "og_meta";
          } else {
            $('script[type="application/ld+json"]').each((_, el) => {
              try {
                const parsed = JSON.parse($(el).html() || "");
                if (parsed.dateModified) {
                  detectedDate = parsed.dateModified;
                  source = "schema_date";
                }
              } catch {
                // ignore
              }
            });
          }
        }

        let ageInDays = 15;
        if (detectedDate) {
          const parsed = new Date(detectedDate).getTime();
          if (!isNaN(parsed)) {
            ageInDays = Math.max(0, Math.round((Date.now() - parsed) / (1000 * 3600 * 24)));
          }
        }

        let status: "fresh" | "moderate" | "stale" = "fresh";
        if (ageInDays > 180) status = "stale";
        else if (ageInDays > 30) status = "moderate";

        pages.push({
          url: targetUrl,
          lastModified: detectedDate,
          ageInDays,
          status,
          source,
        });
      } catch {
        pages.push({
          url: targetUrl,
          ageInDays: 45,
          status: "moderate",
          source: "http_header",
        });
      }
    }
  }

  // Calculate Metrics
  const totalPages = pages.length;
  const freshCount = pages.filter((p) => p.status === "fresh").length;
  const moderateCount = pages.filter((p) => p.status === "moderate").length;
  const staleCount = pages.filter((p) => p.status === "stale").length;

  const averageAgeDays =
    totalPages > 0 ? Math.round(pages.reduce((sum, p) => sum + p.ageInDays, 0) / totalPages) : 0;

  const freshnessScore =
    totalPages > 0
      ? Math.round(((freshCount * 1.0 + moderateCount * 0.7 + staleCount * 0.2) / totalPages) * 100)
      : 70;

  const recommendations: string[] = [];
  if (staleCount > 0) {
    recommendations.push(
      `🚨 Stale Content Alert: ${staleCount} of ${totalPages} audited pages have not been modified in > 180 days. AI search engines heavily demote outdated information in RAG synthesis.`
    );
  } else {
    recommendations.push("✅ Excellent Content Velocity: Key pages are actively maintained and refreshed within recent cycles.");
  }

  if (pages.some((p) => !p.lastModified)) {
    recommendations.push(
      "💡 Sitemap lastmod Hygiene: Ensure your sitemap generator accurately emits `<lastmod>` timestamps to trigger prompt AI re-indexing."
    );
  }

  return {
    domain,
    freshnessScore,
    totalPagesAudited: totalPages,
    freshPagesCount: freshCount,
    moderatePagesCount: moderateCount,
    stalePagesCount: staleCount,
    averageAgeDays,
    pages,
    recommendations,
  };
}
