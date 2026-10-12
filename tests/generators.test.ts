import { describe, it, expect } from "vitest";
import { generateFaq } from "../src/crawler/faq-generator.js";
import { generateFullSchema } from "../src/analyzers/schema-generator.js";
import { generateJsonLdPatch } from "../src/generators/remediation-generator.js";

describe("Generators & Schema Remediation Suite", () => {
  it("should generate FAQ and valid JSON-LD schema from text input", async () => {
    const sampleText = `
      OpenGEO is an open-source technical audit framework for AI generative search optimization.
      It helps websites get cited and recommended by ChatGPT Search, Perplexity, and Google AI Overviews.
      It is free, MIT licensed, and runs offline or with API keys.
    `;

    const result = await generateFaq({
      text: sampleText,
      count: 2,
    });

    expect(result).toBeDefined();
    expect(result.faqs.length).toBeGreaterThanOrEqual(1);
    expect(result.markdown).toContain("## ❓ Frequently Asked Questions (FAQ)");
    expect(result.jsonLdSchema).toContain('"@type": "FAQPage"');
    expect(result.jsonLdSchema).toContain('"@context": "https://schema.org"');
  }, 15000);

  it("should sanitize social media handles and avoid invalid URLs with spaces in schema generator", async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Brand Name Inc. & Co. | Leading AI Analytics</title>
          <meta name="description" content="AI analytics platform">
        </head>
        <body>
          <h1>Brand Name Inc. & Co.</h1>
          <p>Real-time analytics for modern software.</p>
        </body>
      </html>
    `;

    const report = await generateFullSchema({
      url: "https://brandname.com",
      htmlContent: mockHtml,
    });

    // Verify Organization schema sameAs URLs do not contain raw spaces
    const orgSchema = report.generatedSchemas.find((s) => s.type === "Organization");
    expect(orgSchema).toBeDefined();
    const sameAsList = (orgSchema?.jsonLd as any)?.sameAs as string[];
    expect(Array.isArray(sameAsList)).toBe(true);

    for (const link of sameAsList) {
      expect(link).not.toContain(" ");
      expect(link).toMatch(/^https:\/\/(twitter\.com\/|github\.com\/|linkedin\.com\/company\/)[a-z0-9_-]+$/);
    }
  });

  it("should generate clean JSON-LD patch without spaces in social URLs", () => {
    const patch = generateJsonLdPatch("superfast.tools", "Super Fast Tools LLC", "product");

    expect(patch.codeSnippet).toBeDefined();
    // Social links in the patch must not contain spaces or raw punctuation
    expect(patch.codeSnippet).not.toContain("https://twitter.com/Super Fast Tools LLC");
    expect(patch.codeSnippet).toContain("https://twitter.com/superfasttoolsllc");
    expect(patch.codeSnippet).toContain("https://github.com/superfasttoolsllc");
  });
});
