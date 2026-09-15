import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeLlmResponse } from "../src/analyzers/response-analyzer.js";

describe("LLM Response Analyzer & Anti-Hallucination Engine", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(null, { status: 200 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("accurately detects positive, neutral, and negative sentiment with -1.0 to +1.0 scores", async () => {
    // 1. Positive
    const posRes = await analyzeLlmResponse({
      text: "Profound is the best and most innovative tool. Highly recommended, intuitive, and a real game-changer!",
      brand: "Profound",
    });
    expect(posRes.sentiment.label).toBe("positive");
    expect(posRes.sentiment.score).toBeGreaterThan(0.4);
    expect(posRes.brandMentioned).toBe(true);

    // 2. Neutral
    const neutralRes = await analyzeLlmResponse({
      text: "Profound is a software platform. It provides video workflows and transcription features.",
      brand: "Profound",
    });
    expect(neutralRes.sentiment.label).toBe("neutral");
    expect(neutralRes.sentiment.score).toBe(0.0);

    // 3. Negative (Overcoming weak negative detection)
    const negRes = await analyzeLlmResponse({
      text: "Profound is terrible, slow, and buggy. It is overpriced and frustrating to use, avoid it.",
      brand: "Profound",
    });
    expect(negRes.sentiment.label).toBe("negative");
    expect(negRes.sentiment.score).toBeLessThan(-0.4);
    expect(negRes.sentiment.negativeKeywords.length).toBeGreaterThan(2);
  });

  it("extracts numerical, currency, scale, and certification claims", async () => {
    const text = `
      OpenGEO raised $10M in Series A funding. Over 50,000 users trust the platform.
      Our benchmarks show a 40% increase in citations and 2.8x higher visibility.
      The platform is SOC 2 and ISO 27001 compliant.
    `;

    const report = await analyzeLlmResponse({
      text,
      extractClaims: true,
    });

    expect(report.extractedClaims).toBeDefined();
    expect(report.extractedClaims!.length).toBeGreaterThanOrEqual(4);

    const currencyClaim = report.extractedClaims!.find((c) => c.type === "currency");
    expect(currencyClaim?.claim).toContain("$10M");

    const percentClaim = report.extractedClaims!.find((c) => c.type === "percentage");
    expect(percentClaim?.claim).toContain("40%");

    const scaleClaim = report.extractedClaims!.find((c) => c.type === "scale");
    expect(scaleClaim?.claim).toContain("50,000 users");

    const certClaim = report.extractedClaims!.find((c) => c.type === "certification");
    expect(certClaim?.claim).toContain("SOC 2");
  });

  it("extracts URLs and skips mock test domains", async () => {
    const text = "Visit https://www.tryprofound.com and https://fake-blog.example.com/posts for more information.";
    const report = await analyzeLlmResponse({
      text,
      verifyUrls: true,
    });

    expect(report.extractedUrls.length).toBe(2);
    expect(report.verifiedCitations).toBeDefined();
    expect(report.verificationSummary).toBeDefined();
    const skipped = report.verifiedCitations!.find((c) => c.url.includes("example.com"));
    expect(skipped?.status).toBe("skipped");
  });
});
