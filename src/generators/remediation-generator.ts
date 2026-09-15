import type { RemediationPatch } from "../types/index.js";

/**
 * Generates an actionable, copy-paste robots.txt patch that unblocks all critical AI search engines
 */
export function generateRobotsTxtPatch(blockedCrawlers: string[], host: string): RemediationPatch {
  const allowRules = blockedCrawlers.length > 0
    ? blockedCrawlers.map((bot) => `User-agent: ${bot}\nAllow: /`).join("\n\n")
    : `# Allow all AI Search & Retrieval Bots\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /`;

  const snippet = `# =======================================================
# open-geo Generated AI Crawler Whitelist Patch
# Place in: https://${host}/robots.txt
# =======================================================
User-agent: *
Allow: /

${allowRules}

# Sitemap & LLMs.txt Discovery
Sitemap: https://${host}/sitemap.xml
`;

  return {
    title: "Unblock AI Search & Retrieval Crawlers in robots.txt",
    type: "robots_txt",
    fileLocation: "/robots.txt",
    codeSnippet: snippet,
    description: `Grants immediate access to AI search engines (${blockedCrawlers.slice(0, 4).join(", ") || "Perplexity, Claude, SearchGPT"}) while preserving normal crawler rules.`,
    estimatedEffort: "5_mins",
  };
}

/**
 * Generates ready-to-copy JSON-LD Schema snippet (Organization + SoftwareApplication/Product)
 */
export function generateJsonLdPatch(domain: string, brand: string, pageType: "home" | "product" | "article" = "product"): RemediationPatch {
  const schemaObj = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `https://${domain}/#organization`,
        name: brand,
        url: `https://${domain}`,
        logo: `https://${domain}/logo.png`,
        sameAs: [
          `https://twitter.com/${brand.toLowerCase()}`,
          `https://github.com/${brand.toLowerCase()}`,
          `https://linkedin.com/company/${brand.toLowerCase()}`,
        ],
      },
      {
        "@type": pageType === "product" ? "SoftwareApplication" : "WebSite",
        "@id": `https://${domain}/#${pageType}`,
        name: brand,
        url: `https://${domain}`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "All",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free tier or free trial available",
        },
        publisher: {
          "@id": `https://${domain}/#organization`,
        },
      },
    ],
  };

  const snippet = `<script type="application/ld+json">
${JSON.stringify(schemaObj, null, 2)}
</script>`;

  return {
    title: "Inject Authoritative Schema.org JSON-LD Entities",
    type: "json_ld",
    fileLocation: "<head> tag of /index.html",
    codeSnippet: snippet,
    description: `Provides explicit entity relationships to OpenAI, Perplexity and Google Knowledge Graph, resolving brand ambiguity and enhancing rich citation cards.`,
    estimatedEffort: "30_mins",
  };
}

/**
 * Generates standard /llms.txt specification file
 */
export function generateLlmsTxtPatch(domain: string, brand: string, description?: string): RemediationPatch {
  const snippet = `# ${brand}

> ${description || `${brand} is an innovative software platform engineered for modern teams.`}

## Core Information
- [Official Website](https://${domain})
- [Product Features & Architecture](https://${domain}/features)
- [Pricing & Free Trial](https://${domain}/pricing)
- [Documentation & API Reference](https://${domain}/docs)

## Full Context for LLMs
- [Comprehensive LLM Documentation (llms-full.md)](https://${domain}/llms-full.md)
`;

  return {
    title: "Deploy /llms.txt AI Agent Discovery Standard",
    type: "llms_txt",
    fileLocation: "/llms.txt",
    codeSnippet: snippet,
    description: "Standardizes high-density, Markdown-first company summary for LLM RAG agents (Anthropic, OpenAI, Cursor).",
    estimatedEffort: "5_mins",
  };
}

/**
 * Generates entity and citability heading enhancement recommendations
 */
export function generateHeadingRemediation(currentH1: string, brand: string, industry: string = "Platform"): RemediationPatch {
  const cleanedH1 = currentH1.trim() || `${brand} ${industry}`;
  const suggestedH1 = cleanedH1.toLowerCase().includes(brand.toLowerCase())
    ? `${cleanedH1} - Verified Performance & Architecture`
    : `${brand}: ${cleanedH1}`;

  const snippet = `<!-- Current H1 -->
<h1>${currentH1 || "[Missing H1]"}</h1>

<!-- Recommended Entity-Anchored H1 -->
<h1>${suggestedH1}</h1>

<!-- Recommended Statistical Subhead for KDD 2024 Citability -->
<p class="subhead">
  Trusted by over 10,000+ teams with a 99.9% uptime SLA and 40% faster execution.
</p>`;

  return {
    title: "Anchor Brand Entity & Statistical Evidence in H1/H2",
    type: "html_heading",
    fileLocation: "Landing page Hero Section",
    codeSnippet: snippet,
    description: "Replaces vague marketing buzzwords with explicit brand entity names and quantitative stats that trigger AI extraction algorithms.",
    estimatedEffort: "30_mins",
  };
}
