import { describe, it, expect } from "vitest";
import { auditRetrievalQuality } from "../src/analyzers/retrieval-quality.js";
import { auditContentFreshness } from "../src/analyzers/freshness.js";
import { generateFullSchema } from "../src/analyzers/schema-generator.js";

describe("Advanced Technical Quality & Schema Tools", () => {
  describe("Retrieval Quality & Crawler Readiness (geo_retrieval_quality)", () => {
    it("audits Text-to-HTML ratio and JS dependency risk", async () => {
      // 1. High-bloat CSR dummy HTML
      const bloatedHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Bloated App</title>
            <script>var x = "${'a'.repeat(40000)}";</script>
          </head>
          <body>
            <div id="root">Loading...</div>
          </body>
        </html>
      `;

      const report = await auditRetrievalQuality({
        url: "https://app.example.com",
        htmlContent: bloatedHtml,
      });

      expect(report.url).toBe("https://app.example.com");
      expect(report.rawHtmlBytes).toBeGreaterThan(40000);
      expect(report.textToHtmlRatio).toBeLessThan(1.0);
      expect(report.jsDependencyRisk).toBe("critical");
      expect(report.overallScore).toBeLessThan(60);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it("evaluates canonical tag validity", async () => {
      const validHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Fast SSR Content Page</title>
            <link rel="canonical" href="https://example.com/docs" />
          </head>
          <body>
            <h1>Comprehensive GEO Architecture</h1>
            <p>Generative Engine Optimization is transforming how content is discovered by AI agents and large language models.</p>
          </body>
        </html>
      `;

      const report = await auditRetrievalQuality({
        url: "https://example.com/docs",
        htmlContent: validHtml,
      });

      expect(report.canonicalCheck.hasCanonical).toBe(true);
      expect(report.canonicalCheck.isSelfReferencing).toBe(true);
      expect(report.jsDependencyRisk).toBe("none");
      expect(report.overallScore).toBeGreaterThanOrEqual(80);
    });
  });

  describe("Content Freshness Audit (geo_content_freshness)", () => {
    it("calculates age and categorizes fresh, moderate, and stale pages", async () => {
      const mockPages = [
        {
          url: "https://example.com/blog/2026-news",
          lastModified: "2026-08-25T00:00:00Z",
          ageInDays: 8,
          status: "fresh" as const,
          source: "sitemap_lastmod" as const,
        },
        {
          url: "https://example.com/pricing",
          lastModified: "2026-07-01T00:00:00Z",
          ageInDays: 63,
          status: "moderate" as const,
          source: "sitemap_lastmod" as const,
        },
        {
          url: "https://example.com/legacy-guide",
          lastModified: "2024-01-01T00:00:00Z",
          ageInDays: 600,
          status: "stale" as const,
          source: "sitemap_lastmod" as const,
        },
      ];

      const report = await auditContentFreshness({
        url: "https://example.com",
        mockPages,
      });

      expect(report.totalPagesAudited).toBe(3);
      expect(report.freshPagesCount).toBe(1);
      expect(report.moderatePagesCount).toBe(1);
      expect(report.stalePagesCount).toBe(1);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("Universal Schema.org Generator (geo_schema_generator)", () => {
    it("detects missing schemas and synthesizes Organization, WebSite, and SoftwareApplication", async () => {
      const htmlWithoutSchema = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Cursor - The AI Code Editor</title>
            <meta name="description" content="Build software faster with Cursor." />
            <link rel="canonical" href="https://cursor.com/features" />
          </head>
          <body>
            <h1>Features of Cursor</h1>
          </body>
        </html>
      `;

      const report = await generateFullSchema({
        url: "https://cursor.com/features",
        brandName: "Cursor",
        htmlContent: htmlWithoutSchema,
      });

      expect(report.missingRecommendedSchemas).toContain("Organization");
      expect(report.missingRecommendedSchemas).toContain("WebSite");
      expect(report.missingRecommendedSchemas).toContain("SoftwareApplication");
      expect(report.missingRecommendedSchemas).toContain("BreadcrumbList");
      expect(report.generatedJsonLd).toContain('"@type": "Organization"');
      expect(report.generatedJsonLd).toContain('"@type": "SoftwareApplication"');
      expect(report.generatedJsonLd).toContain('"@type": "BreadcrumbList"');
      expect(report.generatedJsonLd).toContain("<script type=\"application/ld+json\">");
    });
  });
});
