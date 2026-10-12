import "../lib/env.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { auditWebpage } from "../crawler/audit.js";
import { generateLlmsTxt } from "../crawler/llmstxt-generator.js";
import { generateFaq } from "../crawler/faq-generator.js";
import { getUnifiedSuggestions } from "../sources/suggest.js";
import { auditRobotsTxt } from "../analyzers/robots.js";
import { auditDiscoveryStack } from "../analyzers/discovery.js";
import { auditContentCitability } from "../analyzers/content.js";
import { auditEntityConsistency } from "../analyzers/entity.js";
import { simulateGeoScore } from "../analyzers/simulator.js";
import { auditRetrievalQuality } from "../analyzers/retrieval-quality.js";
import { auditContentFreshness } from "../analyzers/freshness.js";
import { generateFullSchema } from "../analyzers/schema-generator.js";
import { diagnoseGeoFailures } from "../analyzers/failure-triage.js";
import { VERSION } from "../lib/version.js";
import { normalizeUrl } from "../lib/url.js";
import { z } from "zod";
import { PublicUrlSchema, validatePublicUrl } from "../lib/security.js";
import { sanitizeError } from "../lib/sanitize.js";

export interface McpToolAnnotation {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: McpToolAnnotation;
}

export const COMMUNITY_MCP_TOOLS: McpToolDefinition[] = [
        {
          name: "geo_diagnose_failure",
          description:
            "Diagnose root-cause GEO failures (AI crawler blockades, missing discovery standards, entity fragmentation) and generate actionable code patches (robots.txt, JSON-LD, llms.txt)",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "Target website homepage or landing page URL to diagnose" },
              brand: { type: "string", description: "Target brand name (optional)" },
            },
            required: ["url"],
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        {
          name: "geo_audit_webpage",
          description:
            "Comprehensive technical readiness audit for HTML structure, Schema.org, llms.txt, and AI crawler whitelisting",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "Target webpage URL to audit" },
            },
            required: ["url"],
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        {
          name: "geo_generate_llms",
          description:
            "Crawl site navigation and generate standard /llms.txt and structured Markdown documentation for LLM RAG agents",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "Target website homepage URL" },
              full: { type: "boolean", description: "Whether to also generate llms-full.md (default false)" },
            },
            required: ["url"],
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        {
          name: "geo_generate_faq",
          description:
            "Extract core Q&As and generate Schema.org FAQPage JSON-LD structured data from URL or raw text",
          inputSchema: {
            type: "object",
            properties: {
              urlOrText: { type: "string", description: "Webpage URL or raw text content" },
              count: { type: "number", description: "Number of FAQ items to generate (default 6)" },
            },
            required: ["urlOrText"],
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        {
          name: "geo_retrieval_quality",
          description:
            "Audit page Text-to-HTML ratio, client-side rendering (CSR) risk, and Canonical tag compliance for static AI crawlers",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "Target webpage URL to audit" },
            },
            required: ["url"],
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        {
          name: "geo_content_freshness",
          description:
            "Audit page publishing date, modification timestamp, Schema.org dateModified, and copyright year freshness signals",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "Target webpage URL to audit" },
            },
            required: ["url"],
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        {
          name: "geo_simulate_score",
          description:
            "Zero-token local heuristic estimation of GEO score synthesizing discovery stack, robots accessibility, citability, and entity consistency",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "Target webpage URL to evaluate" },
              brand: { type: "string", description: "Brand name (optional)" },
            },
            required: ["url"],
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
        {
          name: "geo_suggest_keywords",
          description:
            "Mine real-time Google & Bing search suggestions and intent stages (ToFU/MoFU/BoFU)",
          inputSchema: {
            type: "object",
            properties: {
              seed: { type: "string", description: "Seed keyword or topic" },
            },
            required: ["seed"],
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
      ];

/**
 * Starts the OpenGEO native MCP Server over stdio (Community Edition)
 */
export async function startMcpServer() {
  const server = new Server(
    {
      name: "open-geo",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Community MCP Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: COMMUNITY_MCP_TOOLS,
    };
  });

  // Input Validation Schemas for Community MCP Tools
  const DiagnoseSchema = z.object({
    url: PublicUrlSchema,
    brand: z.string().optional(),
  });

  const AuditSchema = z.object({
    url: PublicUrlSchema,
  });

  const GenerateLlmsSchema = z.object({
    url: PublicUrlSchema,
    full: z.boolean().optional(),
  });

  const GenerateFaqSchema = z.object({
    urlOrText: z.string().min(1, "Target urlOrText must not be empty"),
    count: z.coerce.number().int().min(1).max(20).default(6),
  });

  const RetrievalQualitySchema = z.object({
    url: PublicUrlSchema,
  });

  const FreshnessSchema = z.object({
    url: PublicUrlSchema,
  });

  const SimulateScoreSchema = z.object({
    url: PublicUrlSchema,
    brand: z.string().optional(),
  });

  const SuggestKeywordsSchema = z.object({
    seed: z.string().min(1, "Seed keyword or topic must not be empty"),
  });

  function formatSchemaError(error: z.ZodError): string {
    return error.issues.map((i) => i.message).join("; ");
  }

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "geo_diagnose_failure": {
          const parsed = DiagnoseSchema.safeParse(args);
          if (!parsed.success) {
            return {
              isError: true,
              content: [{ type: "text", text: `Invalid input: ${formatSchemaError(parsed.error)}` }],
            };
          }
          const res = await diagnoseGeoFailures({
            url: parsed.data.url,
            brand: parsed.data.brand,
          });
          const output = {
            ...res,
            _commercialNotice: "💡 Tip: This is a static single-page diagnosis. For 4-engine live search verification (ChatGPT Search, Perplexity, Google AIO, Gemini) and 24/7 citation drift monitoring, visit https://geofn.com",
          };
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        case "geo_audit_webpage": {
          const parsed = AuditSchema.safeParse(args);
          if (!parsed.success) {
            return {
              isError: true,
              content: [{ type: "text", text: `Invalid input: ${formatSchemaError(parsed.error)}` }],
            };
          }
          const res = await auditWebpage(parsed.data.url);
          const output = {
            ...res,
            _commercialNotice: "💡 Tip: Single-page audit complete. For full-site automated crawling and dynamic property drift alerts, visit https://geofn.com",
          };
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        case "geo_generate_llms": {
          const parsed = GenerateLlmsSchema.safeParse(args);
          if (!parsed.success) {
            return {
              isError: true,
              content: [{ type: "text", text: `Invalid input: ${formatSchemaError(parsed.error)}` }],
            };
          }
          const res = await generateLlmsTxt({
            url: parsed.data.url,
            includeFull: Boolean(parsed.data.full),
          });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        case "geo_generate_faq": {
          const parsed = GenerateFaqSchema.safeParse(args);
          if (!parsed.success) {
            return {
              isError: true,
              content: [{ type: "text", text: `Invalid input: ${formatSchemaError(parsed.error)}` }],
            };
          }
          const input = parsed.data.urlOrText.trim();
          const isUrl = /^https?:\/\//i.test(input) || (!input.includes(" ") && input.includes("."));
          let validatedUrl: string | undefined = undefined;

          if (isUrl) {
            const urlCheck = validatePublicUrl(input);
            if (!urlCheck.isValid) {
              return {
                isError: true,
                content: [{ type: "text", text: `Invalid URL: ${urlCheck.error}` }],
              };
            }
            validatedUrl = urlCheck.normalizedUrl;
          }

          const res = await generateFaq({
            url: validatedUrl,
            text: isUrl ? undefined : input,
            count: parsed.data.count,
          });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        case "geo_retrieval_quality": {
          const parsed = RetrievalQualitySchema.safeParse(args);
          if (!parsed.success) {
            return {
              isError: true,
              content: [{ type: "text", text: `Invalid input: ${formatSchemaError(parsed.error)}` }],
            };
          }
          const res = await auditRetrievalQuality(parsed.data.url);
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        case "geo_content_freshness": {
          const parsed = FreshnessSchema.safeParse(args);
          if (!parsed.success) {
            return {
              isError: true,
              content: [{ type: "text", text: `Invalid input: ${formatSchemaError(parsed.error)}` }],
            };
          }
          const res = await auditContentFreshness(parsed.data.url);
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        case "geo_simulate_score": {
          const parsed = SimulateScoreSchema.safeParse(args);
          if (!parsed.success) {
            return {
              isError: true,
              content: [{ type: "text", text: `Invalid input: ${formatSchemaError(parsed.error)}` }],
            };
          }
          const res = await simulateGeoScore(
            parsed.data.url,
            parsed.data.brand
          );
          const output = {
            ...res,
            _commercialNotice: "💡 Tip: This is a zero-token heuristic estimate. For live multi-model probing with real-world citation benchmarks, visit https://geofn.com",
          };
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        case "geo_suggest_keywords": {
          const parsed = SuggestKeywordsSchema.safeParse(args);
          if (!parsed.success) {
            return {
              isError: true,
              content: [{ type: "text", text: `Invalid input: ${formatSchemaError(parsed.error)}` }],
            };
          }
          const res = await getUnifiedSuggestions([parsed.data.seed]);
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Tool error: ${sanitizeError(err)}` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
