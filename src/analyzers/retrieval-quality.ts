import * as cheerio from "cheerio";
import type { RetrievalQualityReport } from "../types/index.js";

export interface AuditRetrievalQualityOptions {
  url: string;
  htmlContent?: string;
}

/**
 * Audits Static Crawler Readiness & Retrieval Quality
 * Evaluates Text-to-HTML ratio, client-side JS dependency risk, canonical loops, and redirects.
 */
export async function auditRetrievalQuality(
  options: AuditRetrievalQualityOptions | string
): Promise<RetrievalQualityReport> {
  const targetUrl = typeof options === "string" ? options : options.url;
  let html = typeof options === "object" ? options.htmlContent || "" : "";
  let redirectsCount = 0;

  if (!html) {
    try {
      const res = await fetch(targetUrl, {
        headers: { "User-Agent": "open-geo-retrieval-audit/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        html = await res.text();
        if (res.redirected) {
          redirectsCount = 1;
        }
      }
    } catch (err: any) {
      // fallback
    }
  }

  const rawHtmlBytes = Buffer.byteLength(html, "utf-8");
  const $ = cheerio.load(html || "<html><body></body></html>");

  // 1. Canonical Tag Check
  const canonicalHref = $('link[rel="canonical"]').attr("href")?.trim();
  const hasCanonical = Boolean(canonicalHref);
  let isSelfReferencing = false;
  let canonicalIssue: string | undefined;

  if (hasCanonical && canonicalHref) {
    try {
      const parsedCanonical = new URL(canonicalHref, targetUrl);
      const parsedTarget = new URL(targetUrl);
      isSelfReferencing =
        parsedCanonical.origin === parsedTarget.origin &&
        parsedCanonical.pathname.replace(/\/+$/, "") === parsedTarget.pathname.replace(/\/+$/, "");
      if (!isSelfReferencing) {
        canonicalIssue = `Canonical points to a different URL: ${canonicalHref}`;
      }
    } catch {
      canonicalIssue = `Invalid canonical URL format: ${canonicalHref}`;
    }
  } else {
    canonicalIssue = "Missing <link rel='canonical'> tag in <head>.";
  }

  // 2. Extract Visible Text vs Boilerplate
  $("script, style, noscript, svg, path, iframe").remove();
  const visibleText = $("body").text().replace(/\s+/g, " ").trim();
  const textBytes = Buffer.byteLength(visibleText, "utf-8");
  const extractedTextWords = visibleText.split(/\s+/).filter((w) => w.length > 0).length;

  // Calculate Text-to-HTML Ratio
  const textToHtmlRatio =
    rawHtmlBytes > 0 ? Math.round((textBytes / rawHtmlBytes) * 1000) / 10 : 0;

  // 3. Client-Side Rendering & JS Dependency Risk Evaluation
  let jsDependencyRisk: "none" | "low" | "high" | "critical" = "none";
  if (rawHtmlBytes > 30000 && extractedTextWords < 120) {
    jsDependencyRisk = "critical";
  } else if (textToHtmlRatio < 4.0) {
    jsDependencyRisk = "high";
  } else if (textToHtmlRatio < 10.0) {
    jsDependencyRisk = "low";
  }

  // 4. Overall Score Calculation (0 - 100)
  let overallScore = 100;
  if (jsDependencyRisk === "critical") overallScore -= 45;
  else if (jsDependencyRisk === "high") overallScore -= 30;
  else if (jsDependencyRisk === "low") overallScore -= 15;

  if (!hasCanonical) overallScore -= 15;
  else if (!isSelfReferencing) overallScore -= 10;

  if (redirectsCount > 0) overallScore -= 5;
  if (rawHtmlBytes > 300000) overallScore -= 10; // Page HTML bloat

  overallScore = Math.max(10, Math.min(100, overallScore));

  // 5. Compiling Findings & Actionable Recommendations
  const findings: string[] = [
    `Text-to-HTML Ratio: ${textToHtmlRatio}% (Visible text: ${textBytes} bytes vs HTML: ${rawHtmlBytes} bytes)`,
    `Visible Content Depth: ${extractedTextWords} words`,
    `JS Execution Dependency: ${jsDependencyRisk.toUpperCase()}`,
    `Canonical Tag: ${hasCanonical ? (isSelfReferencing ? "Self-referencing (Valid)" : canonicalIssue) : "Missing"}`,
    `Redirects: ${redirectsCount} hop(s)`,
  ];

  const recommendations: string[] = [];
  if (jsDependencyRisk === "critical" || jsDependencyRisk === "high") {
    recommendations.push(
      `🚨 Critical Static Crawler Risk (Text-to-HTML: ${textToHtmlRatio}%): Page is heavily bloated with inline scripts/styles. AI search crawlers without full headless JS rendering (e.g. ClaudeBot, CCBot) cannot index your core value proposition. Implement Server-Side Rendering (SSR) or Static Site Generation (SSG).`
    );
  }

  if (!hasCanonical) {
    recommendations.push(
      "💡 Canonical Hygiene: Add `<link rel='canonical' href='...'>` to prevent AI search engines from indexing duplicate or parameterized URL variants."
    );
  }

  if (rawHtmlBytes > 250000) {
    recommendations.push(
      `💡 DOM Optimization: Raw HTML size is ${Math.round(rawHtmlBytes / 1024)}KB. Defer non-critical scripts and reduce inline JSON payloads to speed up RAG crawler token ingestion.`
    );
  }

  return {
    url: targetUrl,
    overallScore,
    textToHtmlRatio,
    rawHtmlBytes,
    extractedTextWords,
    jsDependencyRisk,
    canonicalCheck: {
      hasCanonical,
      canonicalUrl: canonicalHref,
      isSelfReferencing,
      issue: canonicalIssue,
    },
    redirectsCount,
    findings,
    recommendations,
  };
}
