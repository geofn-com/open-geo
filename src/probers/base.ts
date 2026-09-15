import type { ProberResult, SyntheticPrompt } from "../types/index.js";

export interface IProber {
  name: string;
  probe(prompt: SyntheticPrompt, brand: string, domain: string): Promise<ProberResult>;
}

/**
 * Extracts URLs and Markdown links from text
 */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  
  // Markdown links [text](url)
  const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let match;
  while ((match = mdRegex.exec(text)) !== null) {
    const cleanUrl = match[2].replace(/[.,;:)]+$/, "");
    if (!urls.includes(cleanUrl)) {
      urls.push(cleanUrl);
    }
  }

  // Raw URLs
  const rawUrlRegex = /(https?:\/\/[^\s<>"']+)/g;
  while ((match = rawUrlRegex.exec(text)) !== null) {
    const cleanUrl = match[1].replace(/[.,;:)]+$/, "");
    if (!urls.includes(cleanUrl)) {
      urls.push(cleanUrl);
    }
  }

  return urls;
}

/**
 * Checks if a brand name is mentioned in text, enforcing word boundaries for short brand names
 */
export function isBrandMentioned(text: string, brand: string): boolean {
  const trimmed = brand.trim();
  if (!trimmed) return false;
  // If brand is short (<= 4 chars, e.g. "AI", "Go", "In", "Up"), require word boundaries to avoid substring false positives
  if (trimmed.length <= 4) {
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  }
  return text.toLowerCase().includes(trimmed.toLowerCase());
}

/**
 * Evaluates brand mention, rank, and sentiment from response text
 */
export function evaluateResponse(
  text: string,
  brand: string,
  domain: string
): {
  mentioned: boolean;
  mentionIndex: number;
  sentiment: "positive" | "neutral" | "negative" | "none";
  citedUrls: string[];
  domainCited: boolean;
} {
  const lowerText = text.toLowerCase();
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();

  const mentioned = isBrandMentioned(text, brand) || (cleanDomain.length > 0 && lowerText.includes(cleanDomain));
  const citedUrls = extractUrls(text);
  const domainCited = cleanDomain.length > 0 && citedUrls.some((u) => u.toLowerCase().includes(cleanDomain));

  if (!mentioned) {
    return {
      mentioned: false,
      mentionIndex: -1,
      sentiment: "none",
      citedUrls,
      domainCited,
    };
  }

  // Calculate mention order:
  // 1. Check structured bullet points, numbered lists, or bold item headers
  const lines = text.split("\n");
  let rank = -1;
  let listCounter = 0;

  for (const line of lines) {
    const isList = /^\s*(\d+[\.\)]|[-*•]|\*\*(\d+[\.\)]|[A-Z]))\s+/.test(line);
    if (isList) {
      if (isBrandMentioned(line, brand) || (cleanDomain && line.toLowerCase().includes(cleanDomain))) {
        rank = listCounter;
        break;
      }
      listCounter++;
    }
  }

  // 2. Dual-mode fallback: if no structured list was detected, evaluate semantic paragraph placement
  if (rank === -1) {
    const nonEmptyParagraphs = lines.map((l) => l.trim()).filter((l) => l.length > 20);
    const paraIndex = nonEmptyParagraphs.findIndex(
      (p) => isBrandMentioned(p, brand) || (cleanDomain && p.toLowerCase().includes(cleanDomain))
    );

    if (paraIndex >= 0) {
      const targetPara = nonEmptyParagraphs[paraIndex] || "";
      const isSecondaryContext = /(other|alternative|emerging|also consider|additional|honorable mention)/i.test(
        targetPara
      );

      if (paraIndex <= 1 && !isSecondaryContext) {
        rank = 0; // Primary recommended solution in opening summary
      } else if (paraIndex <= 2 && !isSecondaryContext) {
        rank = 1; // Direct follow-up recommendation
      } else if (paraIndex <= 3) {
        rank = 2; // Top-3 consideration set
      } else {
        rank = 3; // Mentioned beyond top-3
      }
    }
  }

  // Sentiment heuristic
  let sentiment: "positive" | "neutral" | "negative" = "neutral";
  const positiveWords = ["recommended", "best", "great", "powerful", "leader", "excellent", "top-tier", "leading", "reliable", "intuitive"];
  const negativeWords = ["poor", "flaw", "lacking", "expensive", "buggy", "inferior", "worst", "unreliable", "overpriced", "drawback"];

  const posHits = positiveWords.filter((w) => lowerText.includes(w)).length;
  const negHits = negativeWords.filter((w) => lowerText.includes(w)).length;

  if (posHits > negHits + 1) sentiment = "positive";
  else if (negHits > posHits + 1) sentiment = "negative";

  return {
    mentioned: true,
    mentionIndex: rank,
    sentiment,
    citedUrls,
    domainCited,
  };
}
