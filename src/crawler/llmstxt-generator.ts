import * as cheerio from "cheerio";
import { UniversalLLMProber } from "../probers/llm.js";
import type { LlmsTxtOutput, PageInfo } from "../types/index.js";
import { USER_AGENT as CRAWLER_USER_AGENT } from "../lib/version.js";

/**
 * Categorizes a page URL into functional sections
 */
function categorizeUrl(urlPath: string): { category: PageInfo["category"]; priority: number } {
  const p = urlPath.toLowerCase();
  if (
    p.includes("/doc") ||
    p.includes("/guide") ||
    p.includes("/api") ||
    p.includes("/tutorial") ||
    p.includes("/getting-started") ||
    p.includes("/quickstart") ||
    p.includes("/manual")
  ) {
    return { category: "docs", priority: 1 };
  }
  if (
    p.includes("/product") ||
    p.includes("/feature") ||
    p.includes("/pricing") ||
    p.includes("/solution") ||
    p.includes("/tool") ||
    p.includes("/service") ||
    p.includes("/integration")
  ) {
    return { category: "product", priority: 1 };
  }
  if (p.includes("/about") || p.includes("/company") || p.includes("/team") || p.includes("/contact")) {
    return { category: "about", priority: 3 };
  }
  if (p.includes("/blog") || p.includes("/post") || p.includes("/news") || p.includes("/article")) {
    return { category: "blog", priority: 3 };
  }
  return { category: "other", priority: 2 };
}

/**
 * Attempts to discover URLs from sitemap.xml or sitemap_index.xml
 */
async function discoverSitemapUrls(origin: string, maxPages: number): Promise<string[]> {
  const sitemapUrls = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const discovered: string[] = [];

  for (const sUrl of sitemapUrls) {
    try {
      const res = await fetch(sUrl, {
        headers: {
          "User-Agent": CRAWLER_USER_AGENT,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const xml = await res.text();
        const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
        let match;
        while ((match = locRegex.exec(xml)) !== null) {
          const u = match[1].trim();
          try {
            const parsed = new URL(u);
            if (
              parsed.origin === origin &&
              !parsed.pathname.match(/\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|xml)$/i) &&
              !parsed.pathname.includes("/tag/") &&
              !parsed.pathname.includes("/category/") &&
              !parsed.pathname.includes("/author/") &&
              !discovered.includes(u)
            ) {
              discovered.push(u);
              if (discovered.length >= maxPages) break;
            }
          } catch {
            // ignore
          }
        }
        if (discovered.length > 0) return discovered;
      }
    } catch {
      // ignore
    }
  }

  return discovered;
}

/**
 * Extracts clean markdown representation of the main content
 */
function extractCleanMarkdown($: cheerio.CheerioAPI): string {
  // Remove non-content elements
  $("script, style, nav, footer, header, noscript, svg, iframe, form").remove();

  const mainArea = $("main, article, #content, .content, .main").first();
  const target = mainArea.length > 0 ? mainArea : $("body");

  const textLines: string[] = [];
  target.find("h1, h2, h3, p, li").each((_, el) => {
    const tagName = el.tagName.toLowerCase();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;

    if (tagName === "h1") textLines.push(`\n# ${text}\n`);
    else if (tagName === "h2") textLines.push(`\n## ${text}\n`);
    else if (tagName === "h3") textLines.push(`\n### ${text}\n`);
    else if (tagName === "li") textLines.push(`- ${text}`);
    else textLines.push(`${text}\n`);
  });

  return textLines.join("\n").substring(0, 3000);
}

/**
 * Crawls a website and generates standardized llms.txt & llms-full.md files conforming to llmstxt.org v2
 */
export async function generateLlmsTxt(options: {
  url: string;
  maxPages?: number;
  includeFull?: boolean;
}): Promise<LlmsTxtOutput> {
  const { url, maxPages = 15, includeFull = false } = options;
  const baseUrl = new URL(url);
  const origin = baseUrl.origin;

  const visitedUrls = new Set<string>();
  const pages: PageInfo[] = [];
  const pageContents = new Map<string, string>();

  // 1. Crawl Homepage
  let homeTitle = "";
  let homeDescription = "";
  let homeH1 = "";

  try {
    const res = await fetch(origin, {
      headers: {
        "User-Agent": CRAWLER_USER_AGENT,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      homeTitle = $("title").text().trim() || baseUrl.hostname;
      homeDescription =
        $('meta[name="description"]').attr("content")?.trim() ||
        $('meta[property="og:description"]').attr("content")?.trim() ||
        `${homeTitle} platform and services.`;

      homeH1 = $("h1").first().text().trim() || homeTitle;

      if (includeFull) {
        pageContents.set(origin, extractCleanMarkdown($));
      }

      pages.push({
        url: origin,
        title: homeTitle,
        description: homeDescription,
        h1: homeH1,
        category: "product",
        priority: 0,
      });
      visitedUrls.add(origin);

      // 2. Discover URLs: First try Sitemap.xml, then fallback to DOM links
      const sitemapUrls = await discoverSitemapUrls(origin, maxPages);
      if (sitemapUrls.length > 0) {
        for (const sUrl of sitemapUrls) {
          visitedUrls.add(sUrl);
        }
      } else {
        // Collect internal links from DOM
        $("a[href]").each((_, el) => {
          if (visitedUrls.size >= maxPages * 2) return;
          const href = $(el).attr("href");
          if (!href) return;

          try {
            const resolved = new URL(href, origin);
            if (
              resolved.origin === origin &&
              !resolved.pathname.match(/\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|xml)$/i) &&
              !visitedUrls.has(resolved.href)
            ) {
              visitedUrls.add(resolved.href);
            }
          } catch {
            // ignore
          }
        });
      }
    }
  } catch (err: any) {
    throw new Error(`Failed to crawl origin ${origin}: ${err.message}`);
  }

  // 3. Crawl Subpages up to maxPages
  for (const subUrl of Array.from(visitedUrls)) {
    if (pages.length >= maxPages) break;
    if (subUrl === origin) continue;

    try {
      const res = await fetch(subUrl, {
        headers: {
          "User-Agent": CRAWLER_USER_AGENT,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      const title = $("title").text().trim() || subUrl;
      const description =
        $('meta[name="description"]').attr("content")?.trim() ||
        $('meta[property="og:description"]').attr("content")?.trim() ||
        $("p").first().text().trim().substring(0, 120);
      const h1 = $("h1").first().text().trim() || title;

      const { category, priority } = categorizeUrl(new URL(subUrl).pathname);

      if (includeFull) {
        pageContents.set(subUrl, extractCleanMarkdown($));
      }

      pages.push({
        url: subUrl,
        title,
        description: description.replace(/\s+/g, " "),
        h1,
        category,
        priority,
      });
    } catch {
      // skip
    }
  }

  // Sort pages by priority
  pages.sort((a, b) => a.priority - b.priority);

  // 4. Generate High-Density Blockquote (LLM-synthesized if possible)
  let agentSummary = homeDescription;
  try {
    const prober = new UniversalLLMProber({
      name: "Gemini-Summary",
      model: "gemini-2.5-flash",
    });
    const summaryRes = await prober.probe(
      {
        id: "llms-summary",
        title: "Synthesize LLMs.txt Summary",
        prompt: `Given the website titled "${homeTitle}" with headline "${homeH1}" and description "${homeDescription}", write a crisp 1-2 sentence technical summary explaining what this tool/platform does, for whom, and key capabilities. Avoid marketing buzzwords. Output ONLY the 1-2 sentence plain text.`,
        stage: "ToFU",
        intent: "informational",
      },
      homeTitle,
      baseUrl.hostname
    );

    if (summaryRes.rawResponse && !summaryRes.rawResponse.startsWith("Error")) {
      agentSummary = summaryRes.rawResponse.replace(/^["'>\s]+|["'\s]+$/g, "").trim();
    }
  } catch {
    // fallback to homeDescription
  }

  // 5. Format llms.txt according to llmstxt.org v2 specification
  const siteName = homeTitle.split(/[|\-–]/)[0].trim() || baseUrl.hostname;
  const llmsTxtLines: string[] = [];

  llmsTxtLines.push(`# ${siteName}`);
  llmsTxtLines.push(`> ${agentSummary}`);
  llmsTxtLines.push("");

  // Section 1: Core & Documentation
  const corePages = pages.filter((p) => p.category === "product" || p.category === "docs" || p.category === "other");
  if (corePages.length > 0) {
    llmsTxtLines.push("## Core Documentation");
    corePages.forEach((p) => {
      llmsTxtLines.push(`- [${p.title}](${p.url}): ${p.description || p.h1}`);
    });
    llmsTxtLines.push("");
  }

  // Section 2: Standard ## Optional Partition (v2 convention for secondary info)
  const optionalPages = pages.filter((p) => p.category === "about" || p.category === "blog");
  if (optionalPages.length > 0) {
    llmsTxtLines.push("## Optional");
    optionalPages.forEach((p) => {
      llmsTxtLines.push(`- [${p.title}](${p.url}): ${p.description || p.h1}`);
    });
    llmsTxtLines.push("");
  }

  // 6. Generate full markdown knowledge base if requested
  let llmsFullMd: string | undefined = undefined;
  if (includeFull) {
    const fullLines: string[] = [];
    fullLines.push(`# ${siteName} (Full Knowledge Base)`);
    fullLines.push(`> ${agentSummary}`);
    fullLines.push("");

    for (const p of pages) {
      fullLines.push(`---`);
      fullLines.push(`## [${p.title}](${p.url})`);
      fullLines.push(`*Category: \`${p.category}\` | Priority: \`${p.priority}\`*`);
      fullLines.push("");
      const bodyMd = pageContents.get(p.url) || p.description;
      fullLines.push(bodyMd);
      fullLines.push("");
    }

    llmsFullMd = fullLines.join("\n");
  }

  return {
    url,
    siteName,
    description: agentSummary,
    llmsTxt: llmsTxtLines.join("\n"),
    llmsFullMd,
    pagesIncluded: pages.length,
    pages,
  };
}
