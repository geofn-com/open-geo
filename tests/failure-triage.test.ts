import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { diagnoseGeoFailures } from "../src/analyzers/failure-triage.js";

describe("OpenGEO Flagship: Failure Typology & Triage Engine", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = typeof input === "string" ? input : input.toString();

      if (urlStr.includes("robots.txt")) {
        return new Response(
          `User-agent: GPTBot\nDisallow: /\n\nUser-agent: Google-Extended\nDisallow: /\n\nUser-agent: *\nAllow: /`,
          { status: 200, headers: { "Content-Type": "text/plain" } }
        );
      }

      if (urlStr.includes("llms.txt") || urlStr.includes("sitemap.xml")) {
        return new Response("Not Found", { status: 404 });
      }

      // Default HTML page
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Profound - AI Search Optimization & Visibility</title>
          </head>
          <body>
            <h1>Profound Overview</h1>
            <p>Profound is a platform for brand visibility in AI engines. Recent metrics show 10,000 active users worldwide.</p>
            <p>Compare Profound with traditional search optimization platforms.</p>
          </body>
        </html>
      `;
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("diagnoses multi-dimensional failures and generates concrete code patches (offline mock)", async () => {
    const report = await diagnoseGeoFailures({
      url: "https://www.tryprofound.com",
      brand: "Profound",
    });

    expect(report.url).toBe("https://www.tryprofound.com");
    expect(report.brand).toBe("Profound");
    expect(report.overallHealthScore).toBeGreaterThanOrEqual(0);
    expect(report.overallHealthScore).toBeLessThanOrEqual(100);
    expect(report.totalFailuresIdentified).toBeGreaterThanOrEqual(1);
    expect(report.diagnosedItems).toBeDefined();
    expect(report.executiveSummary).toBeDefined();

    // Verify crawler blockage is caught because of GPTBot & Google-Extended disallow
    const crawlerBlock = report.diagnosedItems.find((d) => d.category === "crawler_blocked");
    expect(crawlerBlock).toBeDefined();
    expect(crawlerBlock?.evidence.join(" ")).toContain("GPTBot");

    // Verify code patches are attached if failures exist
    expect(report.actionableFixes.length).toBeGreaterThan(0);
    const patch = report.actionableFixes[0];
    expect(patch.title).toBeDefined();
    expect(patch.codeSnippet.length).toBeGreaterThan(10);
    expect(patch.fileLocation).toBeDefined();
    expect(patch.estimatedEffort).toBeDefined();
  });
});
