import type {
  AnalyzeResponseReport,
  ClaimExtraction,
  VerifiedCitation,
} from "../types/index.js";

const POSITIVE_WORDS = [
  "best",
  "game-changer",
  "game changer",
  "highly recommended",
  "recommended",
  "excellent",
  "great",
  "superb",
  "outstanding",
  "leader",
  "leading",
  "powerful",
  "innovative",
  "fast",
  "reliable",
  "intuitive",
  "smooth",
  "popular",
  "top-tier",
  "top tier",
  "flawless",
];

const NEGATIVE_WORDS = [
  "terrible",
  "buggy",
  "avoid",
  "poor",
  "bad",
  "worst",
  "slow",
  "overpriced",
  "frustrating",
  "annoying",
  "broken",
  "horrible",
  "unreliable",
  "lacks",
  "disappointing",
  "struggling",
  "expensive",
  "failed",
];

const IGNORED_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "127.0.0.1",
  "test.com",
];

import { normalizeUrl } from "../lib/url.js";

/**
 * Verifies if an HTTP URL is genuinely reachable (anti-hallucination check)
 */
async function verifyUrlReachable(rawTargetUrl: string): Promise<VerifiedCitation> {
  const targetUrl = normalizeUrl(rawTargetUrl);
  const urlObj = new URL(targetUrl);
  const domain = urlObj.hostname;

  if (IGNORED_DOMAINS.some((d) => domain.toLowerCase().includes(d))) {
    return {
      url: targetUrl,
      status: "skipped",
      domain,
      error: "Ignored mock/example test domain",
    };
  }

  try {
    const headRes = await fetch(targetUrl, {
      method: "HEAD",
      headers: { "User-Agent": "open-geo-hallucination-checker/1.0" },
      signal: AbortSignal.timeout(3500),
      redirect: "follow",
    });

    // If server forbids HEAD method (405), fallback to fast GET
    if (headRes.status === 405) {
      const getRes = await fetch(targetUrl, {
        method: "GET",
        headers: { "User-Agent": "open-geo-hallucination-checker/1.0" },
        signal: AbortSignal.timeout(3500),
      });
      return {
        url: targetUrl,
        status: getRes.ok ? "reachable" : "unreachable",
        httpStatus: getRes.status,
        domain,
      };
    }

    return {
      url: targetUrl,
      status: headRes.ok ? "reachable" : "unreachable",
      httpStatus: headRes.status,
      domain,
    };
  } catch (err: any) {
    return {
      url: targetUrl,
      status: "unreachable",
      httpStatus: 404,
      domain,
      error: err.message,
    };
  }
}

export interface AnalyzeResponseOptions {
  text: string;
  brand?: string;
  domain?: string;
  verifyUrls?: boolean;
  extractClaims?: boolean;
}

/**
 * Pure Text LLM Response Analyzer:
 * Extracts brand mentions, anti-hallucination URL verification, nuanced sentiment score (-1 to +1), and factual claims.
 */
export async function analyzeLlmResponse(
  options: AnalyzeResponseOptions
): Promise<AnalyzeResponseReport> {
  const { text, brand = "", domain = "", verifyUrls = false, extractClaims = false } = options;
  const lowerText = text.toLowerCase();

  // 1. Brand Mention & Context Snippet
  let brandMentioned = false;
  let brandRank = -1;
  let brandContextSnippet: string | undefined;

  if (brand) {
    const brandLower = brand.toLowerCase();
    const idx = lowerText.indexOf(brandLower);
    if (idx !== -1) {
      brandMentioned = true;
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + brand.length + 60);
      brandContextSnippet = "..." + text.substring(start, end).replace(/\n/g, " ").trim() + "...";

      // Approximate rank if in a numbered list (1. 2. 3.)
      const lines = text.split("\n");
      let listIdx = 0;
      for (const line of lines) {
        if (/^\s*(\d+[\.\)]|\-|\*)\s+/.test(line)) {
          if (line.toLowerCase().includes(brandLower)) {
            brandRank = listIdx;
            break;
          }
          listIdx++;
        }
      }
      if (brandRank === -1 && brandMentioned) {
        brandRank = 0;
      }
    }
  }

  // 2. Detected Competitors
  const detectedCompetitors: string[] = [];
  const competitorCandidates = text.match(/\b[A-Z][a-zA-Z0-9]+(\.[a-z]{2,})?\b/g) || [];
  const stopWords = new Set(["The", "This", "That", "When", "What", "With", "Visit", "Their", "Some", "Our", "And", "For", "Why", "How", "Also"]);
  for (const cand of competitorCandidates) {
    if (
      cand.toLowerCase() !== brand.toLowerCase() &&
      !stopWords.has(cand) &&
      cand.length > 2 &&
      !detectedCompetitors.includes(cand)
    ) {
      detectedCompetitors.push(cand);
    }
  }

  // 3. Nuanced Sentiment Analysis (-1.0 to +1.0)
  const matchedPos: string[] = [];
  const matchedNeg: string[] = [];

  for (const w of POSITIVE_WORDS) {
    const regex = new RegExp(`\\b${w}\\b`, "i");
    if (regex.test(lowerText)) {
      matchedPos.push(w);
    }
  }

  for (const w of NEGATIVE_WORDS) {
    const regex = new RegExp(`\\b${w}\\b`, "i");
    if (regex.test(lowerText)) {
      matchedNeg.push(w);
    }
  }

  let sentimentScore = 0.0;
  const posCount = matchedPos.length;
  const negCount = matchedNeg.length;
  const totalMatches = posCount + negCount;

  if (totalMatches > 0) {
    // Normalization curve: yields positive value for pos, negative for neg
    sentimentScore = Math.round(((posCount - negCount) / Math.max(posCount + negCount, 1)) * 100) / 100;
  }

  let sentimentLabel: "positive" | "neutral" | "negative" = "neutral";
  if (sentimentScore >= 0.25) sentimentLabel = "positive";
  else if (sentimentScore <= -0.25) sentimentLabel = "negative";

  // 4. URL Extraction & Anti-Hallucination Verification
  const urlMatches = text.match(/https?:\/\/[^\s\)\],>"']+/gi) || [];
  const extractedUrls = Array.from(new Set(urlMatches));

  let verifiedCitations: VerifiedCitation[] | undefined;
  let verificationSummary:
    | {
        total: number;
        reachable: number;
        unreachable: number;
        reachableRate: number;
        hallucinationAlert: boolean;
      }
    | undefined;

  if (verifyUrls && extractedUrls.length > 0) {
    verifiedCitations = await Promise.all(
      extractedUrls.map((u) => verifyUrlReachable(u))
    );

    const activeChecked = verifiedCitations.filter((c) => c.status !== "skipped");
    const reachableCount = activeChecked.filter((c) => c.status === "reachable").length;
    const unreachableCount = activeChecked.filter((c) => c.status === "unreachable").length;
    const rate = activeChecked.length > 0 ? Math.round((reachableCount / activeChecked.length) * 100) / 100 : 1.0;

    verificationSummary = {
      total: activeChecked.length,
      reachable: reachableCount,
      unreachable: unreachableCount,
      reachableRate: rate,
      hallucinationAlert: unreachableCount > 0,
    };
  }

  // 5. Fact & Numerical Claims Extraction
  let extractedClaims: ClaimExtraction[] | undefined;
  if (extractClaims) {
    extractedClaims = [];
    const sentences = text.split(/(?<=[.!?。！？])\s+/);

    for (const sent of sentences) {
      const trimmed = sent.trim();
      if (!trimmed) continue;

      // Currency ($10M, €5k)
      const currencyMatch = trimmed.match(/(\$|€|¥)\s*\d+(\.\d+)?\s*(k|m|b|million|billion)?/i);
      if (currencyMatch) {
        extractedClaims.push({
          claim: currencyMatch[0],
          type: "currency",
          context: trimmed,
        });
      }

      // Percentage (40%, +28%)
      const percentMatch = trimmed.match(/[+-]?\d+(\.\d+)?%/);
      if (percentMatch) {
        extractedClaims.push({
          claim: percentMatch[0],
          type: "percentage",
          context: trimmed,
        });
      }

      // Scale (10,000 users, 50k teams)
      const scaleMatch = trimmed.match(/\b\d+(,\d{3})*\+?\s*(users|teams|creators|customers|developers|companies)\b/i);
      if (scaleMatch) {
        extractedClaims.push({
          claim: scaleMatch[0],
          type: "scale",
          context: trimmed,
        });
      }

      // Multipliers (2.8x, 10x)
      const multiplierMatch = trimmed.match(/\b\d+(\.\d+)?x\b/i);
      if (multiplierMatch && !currencyMatch) {
        extractedClaims.push({
          claim: multiplierMatch[0],
          type: "metric",
          context: trimmed,
        });
      }

      // Certifications
      const certMatch = trimmed.match(/\b(SOC\s*2|ISO\s*27001|HIPAA|GDPR|PCI-DSS)\b/i);
      if (certMatch) {
        extractedClaims.push({
          claim: certMatch[0],
          type: "certification",
          context: trimmed,
        });
      }
    }
  }

  return {
    brandMentioned,
    brandRank,
    brandContextSnippet,
    detectedCompetitors: detectedCompetitors.slice(0, 8),
    sentiment: {
      score: sentimentScore,
      label: sentimentLabel,
      positiveKeywords: matchedPos,
      negativeKeywords: matchedNeg,
    },
    extractedUrls,
    verifiedCitations,
    verificationSummary,
    extractedClaims,
  };
}
