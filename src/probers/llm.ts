import "../lib/env.js";
import type { IProber } from "./base.js";
import { evaluateResponse } from "./base.js";
import type { ProberResult, SyntheticPrompt } from "../types/index.js";

function sanitizeApiKey(key?: string): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (
    trimmed.startsWith("your_") ||
    trimmed.endsWith("_here") ||
    trimmed === "placeholder" ||
    trimmed === "undefined"
  ) {
    return "";
  }
  return trimmed;
}

export class UniversalLLMProber implements IProber {
  name: string;
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(options?: {
    name?: string;
    model?: string;
    apiKey?: string;
    baseURL?: string;
  }) {
    // 1. Sanitize & load supported provider keys
    const openrouterKey = sanitizeApiKey(process.env.OPENROUTER_API_KEY);
    const geminiKey = sanitizeApiKey(process.env.GEMINI_API_KEY);
    const deepseekKey = sanitizeApiKey(process.env.DEEPSEEK_API_KEY);
    const openaiKey = sanitizeApiKey(process.env.OPENAI_API_KEY);

    // 2. Resolve Active Key: explicit option > OpenRouter (recommended aggregator) > Gemini > DeepSeek > OpenAI
    if (options?.apiKey !== undefined) {
      this.apiKey = options.apiKey;
    } else if (openrouterKey) {
      this.apiKey = openrouterKey;
    } else if (geminiKey) {
      this.apiKey = geminiKey;
    } else if (deepseekKey) {
      this.apiKey = deepseekKey;
    } else if (openaiKey) {
      this.apiKey = openaiKey;
    } else {
      this.apiKey = "";
    }

    // 3. Resolve BaseURL
    this.baseURL =
      options?.baseURL ||
      process.env.LLM_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      (this.apiKey && this.apiKey === openrouterKey
        ? "https://openrouter.ai/api/v1"
        : this.apiKey && this.apiKey === geminiKey
          ? "https://generativelanguage.googleapis.com/v1beta/openai"
          : this.apiKey && this.apiKey === deepseekKey
            ? "https://api.deepseek.com/v1"
            : "https://api.openai.com/v1");

    // 4. Resolve Model: CLI/option > LLM_MODEL env > Provider-specific recommended default
    if (options?.model && options.model !== "default") {
      this.model = options.model;
    } else if (process.env.LLM_MODEL) {
      this.model = process.env.LLM_MODEL;
    } else if (this.baseURL.includes("openrouter.ai")) {
      // OpenRouter default: google/gemini-2.5-flash (fast, ultra-low cost, high quality)
      this.model = "google/gemini-2.5-flash";
    } else if (this.baseURL.includes("generativelanguage.googleapis.com")) {
      this.model = "gemini-2.5-flash";
    } else if (this.baseURL.includes("deepseek.com")) {
      this.model = "deepseek-chat";
    } else {
      this.model = "gpt-4o-mini";
    }

    // 5. Normalize Google Gemini direct model alias
    if (
      this.baseURL.includes("generativelanguage.googleapis.com") &&
      (this.model === "gemini-3.0-flash" || this.model === "gemini-2.0-flash")
    ) {
      this.model = "gemini-2.5-flash";
    }

    this.name = options?.name || this.model;
  }

  async probe(
    prompt: SyntheticPrompt,
    brand: string,
    domain: string
  ): Promise<ProberResult> {
    const start = Date.now();

    // If no API Key is provided, fallback to an educational simulated heuristic baseline
    if (!this.apiKey) {
      const mockResponse = `[SIMULATION NOTICE - ZERO-TOKEN HEURISTIC BASELINE]
This is an offline heuristic baseline generated to verify the open-geo evaluation pipeline.
In real-time generative search engines (e.g., Perplexity, SearchGPT, Google AI Overviews), visibility dynamically depends on crawlability (/llms.txt), entity authority, and high-density citation signals.

Heuristic Evaluation for inquiry: "${prompt.prompt}"
- Target Brand: ${brand} (${domain})
- Intent Category: ${prompt.intent}
- Simulated Recommendation Tier: Emerging Modern Alternative
- Industry Context: Category leaders and domain-specific platforms were detected. In typical search sessions, ${brand} has growing visibility for specialized use cases.

💡 To run live probing against real LLMs with genuine web citations:
  1. Copy .env.example to .env
  2. Configure OPENROUTER_API_KEY (Recommended: access 100+ models with 1 key) or GEMINI_API_KEY
  3. Re-run: open-geo probe "${brand}" -d "${domain}"`;

      const evalResult = evaluateResponse(mockResponse, brand, domain);

      return {
        model: this.name,
        promptId: prompt.id,
        promptText: prompt.prompt,
        query: prompt.query || prompt.title,
        stage: prompt.stage,
        rawResponse: mockResponse,
        brandMentioned: evalResult.mentioned,
        mentionIndex: evalResult.mentionIndex,
        sentiment: evalResult.sentiment,
        citedUrls: evalResult.citedUrls,
        brandDomainCited: evalResult.domainCited,
        latencyMs: Date.now() - start,
        isSimulated: true,
      };
    }

    try {
      const systemPrompt = `You are an advanced generative AI search engine (similar to Perplexity and Google AI Overviews) answering user research queries.
Your goal is to answer the inquiry with authoritative, comprehensive, and factually grounded recommendations.

Evaluation Criteria:
1. Direct Answer: Provide a succinct direct answer identifying category leaders and modern emerging solutions.
2. Comparative Analysis: Evaluate products based on features, developer experience, scalability, and market reputation.
3. Named Entities & Citations: Always reference concrete brand names and official domains. Include source URLs where relevant.
4. Neutral Tone: Avoid hyperbolic marketing fluff; base recommendations on objective technical merit and market adoption.`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      };
      if (this.baseURL.includes("openrouter.ai")) {
        headers["HTTP-Referer"] = "https://github.com/geofn-com/open-geo";
        headers["X-Title"] = "open-geo";
      }

      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: prompt.prompt,
            },
          ],
          temperature: 0.3,
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorBody || res.statusText}`);
      }

      const data = (await res.json()) as any;
      const text = data.choices?.[0]?.message?.content || "";

      const evalResult = evaluateResponse(text, brand, domain);

      return {
        model: this.name,
        promptId: prompt.id,
        promptText: prompt.prompt,
        query: prompt.query || prompt.title,
        stage: prompt.stage,
        rawResponse: text,
        brandMentioned: evalResult.mentioned,
        mentionIndex: evalResult.mentionIndex,
        sentiment: evalResult.sentiment,
        citedUrls: evalResult.citedUrls,
        brandDomainCited: evalResult.domainCited,
        latencyMs: Date.now() - start,
        isSimulated: false,
      };
    } catch (err: any) {
      return {
        model: this.name,
        promptId: prompt.id,
        promptText: prompt.prompt,
        query: prompt.query || prompt.title,
        stage: prompt.stage,
        rawResponse: `Error calling model: ${err.message}`,
        brandMentioned: false,
        mentionIndex: -1,
        sentiment: "none",
        citedUrls: [],
        brandDomainCited: false,
        latencyMs: Date.now() - start,
        isSimulated: false,
      };
    }
  }
}
