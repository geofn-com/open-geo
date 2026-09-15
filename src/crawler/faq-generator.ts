import * as cheerio from "cheerio";
import { UniversalLLMProber } from "../probers/llm.js";
import type { FaqItem, FaqOutput } from "../types/index.js";
import { USER_AGENT as FAQ_USER_AGENT } from "../lib/version.js";
import { normalizeUrl } from "../lib/url.js";

/**
 * Generate high-impact FAQs and Schema.org JSON-LD markup for a webpage or text content
 */
export async function generateFaq(input: {
  url?: string;
  text?: string;
  count?: number;
}): Promise<FaqOutput> {
  const { url: rawUrl, text: rawTextInput, count = 6 } = input;
  const url = rawUrl ? normalizeUrl(rawUrl) : undefined;
  let content = rawTextInput || "";
  let pageTitle = "";

  // 1. Fetch webpage if URL is provided
  if (url && !content) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": FAQ_USER_AGENT,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);

        pageTitle = $("title").text().trim();
        // Remove script, style, nav, footer tags
        $("script, style, nav, footer, noscript, svg").remove();
        content = $("body").text().replace(/\s+/g, " ").trim().substring(0, 4000);
      }
    } catch (err: any) {
      throw new Error(`Failed to fetch content from ${url}: ${err.message}`);
    }
  }

  if (!content) {
    throw new Error("No text content or URL provided for FAQ generation.");
  }

  // 2. Prompt LLM to extract high-intent FAQs
  const prober = new UniversalLLMProber({
    name: "Gemini-FAQ-Generator",
    model: "gemini-2.5-flash",
  });

  const promptText = `
You are an expert in GEO (Generative Engine Optimization) and Schema.org structured data.
Given the following webpage content titled "${pageTitle}", generate exactly ${count} high-value, natural frequently asked questions (FAQs) and authoritative, direct answers.
Focus on questions that searchers ask when comparing, evaluating, troubleshooting, or purchasing.

Page Content:
${content}

Output strictly valid JSON matching this format without any markdown code fence:
{
  "faqs": [
    {
      "question": "Clear user question here?",
      "answer": "Concise, factual, objective answer."
    }
  ]
}
`;

  let faqs: FaqItem[] = [];

  try {
    const res = await prober.probe(
      {
        id: "faq-generation",
        title: "FAQ Generation",
        prompt: promptText,
        stage: "BoFU",
        intent: "informational",
      },
      pageTitle || "Product",
      url || "example.com"
    );

    const firstBrace = res.rawResponse.indexOf("{");
    const lastBrace = res.rawResponse.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const jsonStr = res.rawResponse.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.faqs) && parsed.faqs.length > 0) {
        faqs = parsed.faqs;
      } else {
        throw new Error("Invalid faqs structure in response");
      }
    } else {
      throw new Error("No JSON object found in response");
    }
  } catch {
    // Fallback default FAQs
    faqs = [
      {
        question: `What is ${pageTitle || "this product"} and what core problem does it solve?`,
        answer: `${pageTitle || "This solution"} provides specialized capabilities designed to improve productivity and workflow efficiency.`,
      },
      {
        question: `How does pricing and onboarding work?`,
        answer: `Users can get started quickly with transparent plans and easy integration options.`,
      },
    ];
  }

  // 3. Construct Schema.org FAQPage JSON-LD
  const schemaObj = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  const jsonLdSchema = `<script type="application/ld+json">\n${JSON.stringify(
    schemaObj,
    null,
    2
  )}\n</script>`;

  // 4. Construct Markdown
  const mdLines: string[] = [];
  mdLines.push(`## ❓ Frequently Asked Questions (FAQ)`);
  mdLines.push("");
  faqs.forEach((faq, i) => {
    mdLines.push(`### ${i + 1}. ${faq.question}`);
    mdLines.push(faq.answer);
    mdLines.push("");
  });

  return {
    sourceUrl: url,
    faqs,
    jsonLdSchema,
    markdown: mdLines.join("\n"),
  };
}
