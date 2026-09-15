import type { KeywordSuggestion } from "../types/index.js";

/**
 * Extracts normalized core search root from a natural language query
 */
export function extractSearchRoot(query: string): string {
  let cleaned = query.toLowerCase().trim();
  
  // Remove common question prefixes & fillers
  const stopPrefixes = [
    /^what (is|are|does)/i,
    /^how (does|do|to|can)/i,
    /^why (is|are|should)/i,
    /^can (i|you|we)/i,
    /^is (it|there)/i,
    /^tell me about/i,
    /^give me/i,
    /^please/i,
  ];

  for (const prefix of stopPrefixes) {
    cleaned = cleaned.replace(prefix, "").trim();
  }

  // Remove punctuation
  cleaned = cleaned.replace(/[?.,!]/g, "").trim();

  // Keep first 3-5 keywords if too long
  const words = cleaned.split(/\s+/);
  if (words.length > 5) {
    cleaned = words.slice(0, 4).join(" ");
  }

  return cleaned;
}

/**
 * Fetches real-time search suggestions from Google Suggest API (Free & Keyless)
 */
export async function fetchGoogleSuggestions(query: string): Promise<KeywordSuggestion[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encoded}`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as [string, string[]];
    const suggestions = data[1] || [];

    return suggestions.map((s) => ({
      query: s,
      source: "google",
    }));
  } catch {
    return [];
  }
}

/**
 * Fetches real-time suggestions from Bing Autocomplete (Free & Keyless)
 */
export async function fetchBingSuggestions(query: string): Promise<KeywordSuggestion[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.bing.com/osjson.aspx?query=${encoded}`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as [string, string[]];
    const suggestions = data[1] || [];

    return suggestions.map((s) => ({
      query: s,
      source: "bing",
    }));
  } catch {
    return [];
  }
}

/**
 * Evaluates real-world search signal strength using Google/Bing Suggestion APIs
 */
export async function evaluateSearchSignal(query: string): Promise<{
  signal: "high" | "medium" | "low" | "emerging";
  normalizedRoot: string;
}> {
  const normalizedRoot = extractSearchRoot(query);
  if (!normalizedRoot) {
    return { signal: "low", normalizedRoot: query };
  }

  // 1. Direct probe with full query
  const directResults = await fetchGoogleSuggestions(query);
  if (directResults.length >= 3) {
    return { signal: "high", normalizedRoot };
  }

  // 2. Root probe
  const rootResults = await fetchGoogleSuggestions(normalizedRoot);
  if (rootResults.length >= 5) {
    return { signal: "high", normalizedRoot };
  }
  if (rootResults.length >= 1) {
    return { signal: "medium", normalizedRoot };
  }

  // 3. Bing fallback
  const bingResults = await fetchBingSuggestions(normalizedRoot);
  if (bingResults.length >= 2) {
    return { signal: "medium", normalizedRoot };
  }

  // 4. Emerging AI Intent (valid natural question, low traditional search volume)
  return { signal: "emerging", normalizedRoot };
}

/**
 * Combines and deduplicates suggestions across search engines with intent clustering
 */
export async function getUnifiedSuggestions(seedKeywords: string[]): Promise<KeywordSuggestion[]> {
  const allSuggestions: KeywordSuggestion[] = [];
  const seen = new Set<string>();

  for (const seed of seedKeywords) {
    const [googleList, bingList] = await Promise.all([
      fetchGoogleSuggestions(seed),
      fetchBingSuggestions(seed),
    ]);

    for (const item of [...googleList, ...bingList]) {
      const normalized = item.query.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        
        let stage: "ToFU" | "MoFU" | "BoFU" = "ToFU";
        if (
          normalized.includes("vs") ||
          normalized.includes("versus") ||
          normalized.includes("alternative") ||
          normalized.includes("compare") ||
          normalized.includes("review")
        ) {
          stage = "MoFU";
        } else if (
          normalized.includes("price") ||
          normalized.includes("cost") ||
          normalized.includes("buy") ||
          normalized.includes("coupon") ||
          normalized.includes("discount") ||
          normalized.includes("hire") ||
          normalized.includes("best")
        ) {
          stage = "BoFU";
        }

        allSuggestions.push({
          ...item,
          intentStage: stage,
        });
      }
    }
  }

  return allSuggestions;
}
