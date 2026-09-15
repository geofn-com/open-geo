import { describe, it, expect, vi } from "vitest";
import { checkBotAllowedInRobots } from "../src/analyzers/robots.js";
import { auditContentCitability } from "../src/analyzers/content.js";
import { auditEntityConsistency } from "../src/analyzers/entity.js";
import { simulateGeoScore } from "../src/analyzers/simulator.js";

describe("Zero-Token Technical Analyzers", () => {
  describe("Robots Analyzer", () => {
    it("correctly evaluates allow/disallow rules per AI bot", () => {
      const robotsSample = `
User-agent: PerplexityBot
Allow: /

User-agent: GPTBot
Disallow: /

User-agent: *
Disallow: /admin
      `;

      const perplexity = checkBotAllowedInRobots(robotsSample, "PerplexityBot");
      expect(perplexity.allowed).toBe(true);

      const gptBot = checkBotAllowedInRobots(robotsSample, "GPTBot");
      expect(gptBot.allowed).toBe(false);

      const claudeBot = checkBotAllowedInRobots(robotsSample, "ClaudeBot");
      expect(claudeBot.allowed).toBe(true); // wildcard only disallows /admin
    });
  });

  describe("Content Citability Analyzer", () => {
    it("evaluates 10-dimension content quality on rich HTML", async () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Best AI Video Tools in 2026</title>
            <script type="application/ld+json">{"@type": "Article", "name": "AI Video Tools"}</script>
          </head>
          <body>
            <h1>Best AI Video Tools in 2026</h1>
            <h2>Why AI Video Generator Matters</h2>
            <p>Artificial intelligence is transforming content creation workflows. Recent industry benchmarks show video output increased by 40% in 2026, delivering over $10M in cost savings for marketing teams worldwide.</p>
            <h2>Top Recommended Platforms</h2>
            <p>Profound offers modern AI-native workflow automation with over 10,000 active creators. It enables real-time rendering and automated transcription.</p>
            <blockquote>"AI video generation is the single biggest productivity multiplier of this decade." - Expert Reviewer</blockquote>
            <ul>
              <li>High-speed rendering</li>
              <li>Multi-language speech synthesis</li>
            </ul>
          </body>
        </html>
      `;

      const report = await auditContentCitability("https://example.com/article", sampleHtml);
      expect(report.overallScore).toBeGreaterThanOrEqual(50);
      expect(report.dimensions.length).toBe(10);
      expect(report.pageType.type).toBe("Article");
      expect(report.topRecommendations.length).toBeGreaterThan(0);
    });
  });

  describe("Entity Consistency Analyzer", () => {
    it("detects brand variants and consistency score", async () => {
      const sampleHtml = `
        <html>
          <head><title>Profound - AI Video Generation</title></head>
          <body>
            <h1>Welcome to Profound</h1>
            <p>Profound is a platform for creators. Some users also search for Pro Found or profound tools.</p>
          </body>
        </html>
      `;

      const report = await auditEntityConsistency("https://www.tryprofound.com", "Profound", sampleHtml);
      expect(report.canonicalBrand).toBe("Profound");
      expect(report.variants.length).toBeGreaterThanOrEqual(1);
      expect(report.pageConsistencyRate).toBeGreaterThan(0);
    });
  });

  describe("Zero-Token GEO Simulator", () => {
    it("synthesizes sub-scores and estimates overall GEO score", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        if (urlStr.includes("robots.txt")) {
          return new Response("User-agent: *\nAllow: /", { status: 200, headers: { "Content-Type": "text/plain" } });
        }
        if (urlStr.includes("llms.txt") || urlStr.includes("sitemap.xml")) {
          return new Response("Not Found", { status: 404 });
        }
        return new Response(
          "<!DOCTYPE html><html><head><title>Example Domain</title></head><body><h1>Example Domain</h1><p>This domain is for use in illustrative examples in documents.</p></body></html>",
          { status: 200, headers: { "Content-Type": "text/html" } }
        );
      });

      try {
        const report = await simulateGeoScore("https://example.com");
        expect(report.estimatedScore).toBeGreaterThanOrEqual(0);
        expect(report.estimatedScore).toBeLessThanOrEqual(100);
        expect(report.subScores.discoveryStack).toBeDefined();
        expect(report.subScores.contentQuality).toBeDefined();
        expect(report.subScores.citationStrength).toBeDefined();
        expect(report.recommendations.length).toBeGreaterThan(0);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe("URL Normalization & Bare Domain Resilience", () => {
    it("handles URLs without https:// prefix smoothly across all audit engines", async () => {
      const { normalizeUrl } = await import("../src/lib/url.js");
      expect(normalizeUrl("tryprofound.com")).toBe("https://tryprofound.com");
      expect(normalizeUrl("www.example.com/pricing")).toBe("https://www.example.com/pricing");
      expect(normalizeUrl("http://localhost:3000")).toBe("http://localhost:3000");
      expect(normalizeUrl("https://geofn.com")).toBe("https://geofn.com");
    });
  });
});
