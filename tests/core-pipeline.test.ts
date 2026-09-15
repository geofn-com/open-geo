import { describe, it, expect } from "vitest";
import { calculateGeoScorecard } from "../src/core/scorer.js";
import { generateSyntheticPrompts } from "../src/core/intent-generator.js";
import { isBrandMentioned, evaluateResponse, extractUrls } from "../src/probers/base.js";
import { checkBotAllowedInRobots, AI_BOT_DEFINITIONS } from "../src/analyzers/robots.js";
import type { ProberResult } from "../src/types/index.js";

describe("Core Pipeline Unit Tests", () => {
  describe("GEO Scorecard Calculation", () => {
    it("returns zero metrics when results are empty", () => {
      const scorecard = calculateGeoScorecard("TestBrand", "test.com", []);
      expect(scorecard.totalProbes).toBe(0);
      expect(scorecard.visibilityScore).toBe(0);
      expect(scorecard.citationShare).toBe(0);
      expect(scorecard.top3RecommendationRate).toBe(0);
    });

    it("does NOT falsely inflate citationShare when totalCitations is 0", () => {
      // Mock results where brand is mentioned, but LLM produced 0 URL citations
      const mockResults: ProberResult[] = [
        {
          model: "test-model",
          promptId: "p1",
          promptText: "best tools",
          query: "best tools",
          rawResponse: "TestBrand is great.",
          brandMentioned: true,
          mentionIndex: 0,
          sentiment: "positive",
          citedUrls: [], // Zero links
          brandDomainCited: false,
          latencyMs: 100,
          isSimulated: true,
        },
      ];

      const scorecard = calculateGeoScorecard("TestBrand", "test.com", mockResults);
      expect(scorecard.totalProbes).toBe(1);
      // Mention rate is 100%, but citation share must be strictly 0%
      expect(scorecard.citationShare).toBe(0);
      expect(scorecard.top3RecommendationRate).toBe(100);
      // Visibility = 100 * 0.6 + 100 * 0.25 + 0 * 0.15 = 85
      expect(scorecard.visibilityScore).toBe(85);
    });

    it("correctly calculates citationShare and knowledge gaps", () => {
      const mockResults: ProberResult[] = [
        {
          model: "test-model",
          promptId: "p1",
          promptText: "inquiry 1",
          query: "best tools",
          rawResponse: "Visit https://test.com and https://other.com",
          brandMentioned: true,
          mentionIndex: 1, // top 3
          sentiment: "positive",
          citedUrls: ["https://test.com", "https://other.com"],
          brandDomainCited: true,
          latencyMs: 120,
          isSimulated: false,
        },
        {
          model: "test-model",
          promptId: "p2",
          promptText: "inquiry 2",
          query: "TestBrand alternatives",
          rawResponse: "Consider OtherTool.",
          brandMentioned: false,
          mentionIndex: -1,
          sentiment: "none",
          citedUrls: ["https://other.com"],
          brandDomainCited: false,
          latencyMs: 110,
          isSimulated: false,
        },
      ];

      const scorecard = calculateGeoScorecard("TestBrand", "test.com", mockResults);
      expect(scorecard.totalProbes).toBe(2);
      // Total citations = 3 (2 from p1, 1 from p2). Brand citations = 1.
      // Citation share = (1/3) * 100 = 33%
      expect(scorecard.citationShare).toBe(33);
      // Mention rate = 1/2 = 50%. Top 3 rate = 1/2 = 50%.
      expect(scorecard.top3RecommendationRate).toBe(50);
      // Knowledge gaps should capture unmentioned query
      expect(scorecard.knowledgeGaps).toContain("TestBrand alternatives");
    });
  });

  describe("Intent & Category Generator", () => {
    it("normalizes brand and domain to generic category terms", () => {
      const prompts = generateSyntheticPrompts("open-geo", "geofn.com", "", []);
      expect(prompts.length).toBeGreaterThanOrEqual(3);

      const tofu = prompts.find((p) => p.stage === "ToFU");
      expect(tofu).toBeDefined();
      expect(tofu?.query).toContain("Generative Engine Optimization (GEO)");

      const mofu = prompts.find((p) => p.stage === "MoFU");
      expect(mofu).toBeDefined();
      expect(mofu?.query).toContain("open-geo alternatives");
    });
  });

  describe("Prober Response Evaluator & Word Boundaries", () => {
    it("prevents false positive substring matches for short brand names", () => {
      // Short brand "AI" should not match words like "email", "said", "contain"
      const textWithoutAi = "We sent an email containing daily updates and claimed nothing.";
      expect(isBrandMentioned(textWithoutAi, "AI")).toBe(false);

      const textWithAi = "The new AI assistant provides automated research.";
      expect(isBrandMentioned(textWithAi, "AI")).toBe(true);

      // Short brand "Go" should not match "going", "algorithm"
      const textGoing = "We are going to implement an algorithm.";
      expect(isBrandMentioned(textGoing, "Go")).toBe(false);

      const textGo = "Developers love Go for backend microservices.";
      expect(isBrandMentioned(textGo, "Go")).toBe(true);
    });

    it("extracts Markdown and raw URLs correctly", () => {
      const text = `
        Check our docs at [OpenGEO Docs](https://geofn.com/docs) or visit https://github.com/geofn-com.
      `;
      const urls = extractUrls(text);
      expect(urls).toContain("https://geofn.com/docs");
      expect(urls).toContain("https://github.com/geofn-com");
    });

    it("accurately evaluates response ranking and domain citations", () => {
      const responseText = `
        Here are the top tools:
        1. Notion - Workspace tool
        2. geofn - Emerging GEO optimization platform (https://geofn.com)
        3. Linear - Issue tracker
      `;

      const evalRes = evaluateResponse(responseText, "geofn", "geofn.com");
      expect(evalRes.mentioned).toBe(true);
      expect(evalRes.mentionIndex).toBe(1); // rank 1 is 2nd place in list
      expect(evalRes.domainCited).toBe(true);
      expect(evalRes.citedUrls).toContain("https://geofn.com");
    });
  });

  describe("Robots & Crawler Blockade Detection", () => {
    it("flags GPTBot and Google-Extended as blocked search/retrieval crawlers", () => {
      const robotsTxt = `
User-agent: GPTBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: *
Allow: /
      `;

      // Verify checkBotAllowedInRobots flags them
      const gptCheck = checkBotAllowedInRobots(robotsTxt, "GPTBot");
      expect(gptCheck.allowed).toBe(false);

      const googleCheck = checkBotAllowedInRobots(robotsTxt, "Google-Extended");
      expect(googleCheck.allowed).toBe(false);

      // Verify botMatrix mapping marks category as mixed
      const gptDef = AI_BOT_DEFINITIONS.find((b) => b.botName === "GPTBot");
      expect(gptDef?.category).toBe("mixed");

      // Verify failure-triage filtering captures both search and mixed bots
      const mockBotMatrix = [
        { botName: "GPTBot", category: "mixed", allowed: false },
        { botName: "Google-Extended", category: "mixed", allowed: false },
        { botName: "PerplexityBot", category: "search", allowed: true },
        { botName: "CCBot", category: "training", allowed: false },
      ];
      const blocked = mockBotMatrix
        .filter((b) => (b.category === "search" || b.category === "mixed") && !b.allowed)
        .map((b) => b.botName);

      expect(blocked).toContain("GPTBot");
      expect(blocked).toContain("Google-Extended");
      expect(blocked).not.toContain("CCBot"); // pure training scraper excluded
    });
  });
});
