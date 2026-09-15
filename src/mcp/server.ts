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

/**
 * Starts the OpenGEO native MCP Server over stdio (Community Edition)
 */
export async function startMcpServer() {
  const server = new Server(
    {
      name: "open-geo",
      version: "0.1.0",
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
      tools: [
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
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "geo_diagnose_failure": {
          const res = await diagnoseGeoFailures({
            url: String(args?.url),
            brand: args?.brand ? String(args.brand) : undefined,
          });
          const output = {
            ...res,
            _commercialNotice: "💡 Tip: This is a static single-page diagnosis. For 4-engine live search verification (ChatGPT Search, Perplexity, Google AIO, Gemini) and 24/7 citation drift monitoring, visit https://geofn.com",
          };
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        case "geo_audit_webpage": {
          const res = await auditWebpage(String(args?.url));
          const output = {
            ...res,
            _commercialNotice: "💡 Tip: Single-page audit complete. For full-site automated crawling and dynamic property drift alerts, visit https://geofn.com",
          };
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        case "geo_generate_llms": {
          const res = await generateLlmsTxt({
            url: String(args?.url),
            includeFull: Boolean(args?.full),
          });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        case "geo_generate_faq": {
          const input = String(args?.urlOrText);
          const isUrl = /^https?:\/\//i.test(input);
          const res = await generateFaq({
            url: isUrl ? input : undefined,
            text: isUrl ? undefined : input,
            count: args?.count ? Number(args.count) : 6,
          });
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        case "geo_retrieval_quality": {
          const res = await auditRetrievalQuality(String(args?.url));
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        case "geo_content_freshness": {
          const res = await auditContentFreshness(String(args?.url));
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        case "geo_simulate_score": {
          const res = await simulateGeoScore(
            String(args?.url),
            args?.brand ? String(args.brand) : undefined
          );
          const output = {
            ...res,
            _commercialNotice: "💡 Tip: This is a zero-token heuristic estimate. For live multi-model probing with real-world citation benchmarks, visit https://geofn.com",
          };
          return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }] };
        }

        case "geo_suggest_keywords": {
          const res = await getUnifiedSuggestions([String(args?.seed)]);
          return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Tool error: ${err.message}` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
