import * as cheerio from "cheerio";
import type { SchemaGeneratorReport } from "../types/index.js";
import { normalizeUrl } from "../lib/url.js";
import { safeFetchText } from "../lib/http.js";

export interface GenerateSchemaOptions {
  url: string;
  brandName?: string;
  category?: string;
  htmlContent?: string;
}

/**
 * Normalizes brand name to valid alphanumeric social handle
 */
function slugifyHandle(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

/**
 * Universal Schema.org JSON-LD Generator & Completer
 * Audits existing schemas on a page and generates standard, compliant JSON-LD blocks for missing types.
 */
export async function generateFullSchema(
  options: GenerateSchemaOptions | string
): Promise<SchemaGeneratorReport> {
  const targetUrl = normalizeUrl(typeof options === "string" ? options : options.url);
  const brandName = typeof options === "object" ? options.brandName : undefined;
  let html = typeof options === "object" ? options.htmlContent || "" : "";
  let fetchError: string | undefined = undefined;

  if (!html) {
    const fetchRes = await safeFetchText(targetUrl, { timeoutMs: 8000 });
    if (fetchRes.ok && fetchRes.text) {
      html = fetchRes.text;
    } else {
      fetchError = fetchRes.error;
    }
  }

  const $ = cheerio.load(html || "<html><head></head><body></body></html>");
  let domain = "";
  let baseOrigin = "";
  let urlObj: URL | null = null;
  try {
    urlObj = new URL(targetUrl);
    domain = urlObj.hostname.replace(/^www\./, "");
    baseOrigin = urlObj.origin;
  } catch {
    domain = targetUrl.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
    baseOrigin = targetUrl;
  }

  // 1. Detect Existing Schemas
  const detectedSchemas: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() || "");
      if (parsed["@type"]) detectedSchemas.push(String(parsed["@type"]));
      if (Array.isArray(parsed["@graph"])) {
        parsed["@graph"].forEach((g: any) => {
          if (g["@type"]) detectedSchemas.push(String(g["@type"]));
        });
      }
    } catch {
      // ignore
    }
  });

  // 2. Extract Metadata for Schema Synthesis
  const title = $("title").text().trim() || domain;
  const description =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    `${domain} provides AI-driven software solutions.`;

  const canonical = $('link[rel="canonical"]').attr("href") || targetUrl;
  const logo =
    $('link[rel="icon"]').attr("href") ||
    $('meta[property="og:image"]').attr("content") ||
    `${baseOrigin}/logo.png`;

  const derivedBrand =
    brandName ||
    title.split(/[-|:]/)[0]?.trim() ||
    domain.split(".")[0].toUpperCase();

  // 3. Synthesize Standard Schemas
  const generatedSchemas: Array<{ type: string; jsonLd: Record<string, any> }> = [];
  const missingRecommendedSchemas: string[] = [];

  // Schema 1: Organization
  if (!detectedSchemas.includes("Organization")) {
    missingRecommendedSchemas.push("Organization");
    generatedSchemas.push({
      type: "Organization",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": derivedBrand,
        "url": baseOrigin,
        "logo": logo.startsWith("http") ? logo : `${baseOrigin}${logo}`,
        "description": description,
        "sameAs": [
          `https://twitter.com/${slugifyHandle(derivedBrand)}`,
          `https://github.com/${slugifyHandle(derivedBrand)}`,
          `https://linkedin.com/company/${slugifyHandle(derivedBrand)}`,
        ].filter((link) => !link.endsWith("/")),
      },
    });
  }

  // Schema 2: WebSite with SearchAction
  if (!detectedSchemas.includes("WebSite")) {
    missingRecommendedSchemas.push("WebSite");
    generatedSchemas.push({
      type: "WebSite",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": derivedBrand,
        "url": baseOrigin,
        "potentialAction": {
          "@type": "SearchAction",
          "target": `${baseOrigin}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    });
  }

  // Schema 3: SoftwareApplication (for SaaS/Tech)
  if (!detectedSchemas.includes("SoftwareApplication") && !detectedSchemas.includes("Product")) {
    missingRecommendedSchemas.push("SoftwareApplication");
    generatedSchemas.push({
      type: "SoftwareApplication",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": derivedBrand,
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "All",
        "offers": {
          "@type": "Offer",
          "price": "0.00",
          "priceCurrency": "USD",
        },
        "description": description,
      },
    });
  }

  // Schema 4: BreadcrumbList (if path has depth)
  if (urlObj && urlObj.pathname.length > 1 && !detectedSchemas.includes("BreadcrumbList")) {
    missingRecommendedSchemas.push("BreadcrumbList");
    const segments = urlObj.pathname.split("/").filter(Boolean);
    const itemListElement = [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": baseOrigin,
      },
    ];

    let runningPath = baseOrigin;
    segments.forEach((seg: string, i: number) => {
      runningPath += `/${seg}`;
      itemListElement.push({
        "@type": "ListItem",
        "position": i + 2,
        "name": seg.charAt(0).toUpperCase() + seg.slice(1).replace(/[-_]/g, " "),
        "item": runningPath,
      });
    });

    generatedSchemas.push({
      type: "BreadcrumbList",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": itemListElement,
      },
    });
  }

  // Format as Ready-to-Copy HTML Scripts
  const combinedJsonLd =
    generatedSchemas.length === 1
      ? generatedSchemas[0].jsonLd
      : {
          "@context": "https://schema.org",
          "@graph": generatedSchemas.map((s) => s.jsonLd),
        };

  const generatedHtmlScript = `<script type="application/ld+json">\n${JSON.stringify(
    combinedJsonLd,
    null,
    2
  )}\n</script>`;

  const validationIssues: string[] = [];
  if (missingRecommendedSchemas.length > 0) {
    validationIssues.push(
      `Missing ${missingRecommendedSchemas.length} core Schema.org types: ${missingRecommendedSchemas.join(", ")}.`
    );
  }

  return {
    url: targetUrl,
    detectedSchemas,
    missingRecommendedSchemas,
    generatedJsonLd: generatedHtmlScript,
    generatedSchemas,
    validationIssues,
  };
}
