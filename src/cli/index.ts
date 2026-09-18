#!/usr/bin/env node
import "../lib/env.js";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import fs from "node:fs/promises";
import path from "node:path";
import { auditWebpage } from "../crawler/audit.js";
import { generateLlmsTxt } from "../crawler/llmstxt-generator.js";
import { generateFaq } from "../crawler/faq-generator.js";
import { getUnifiedSuggestions } from "../sources/suggest.js";
import { analyzeQueryFanout } from "../core/fanout-generator.js";
import { runCommunityProbe } from "../core/prober.js";
import { formatGeoMarkdownReport, formatAuditMarkdownReport, formatFanoutMarkdownReport } from "../reporters/markdown.js";
import { startMcpServer } from "../mcp/server.js";
import { VERSION } from "../lib/version.js";
import { normalizeUrl } from "../lib/url.js";
import { safeAtomicWrite, FileExistsError } from "../lib/fs-atomic.js";

const program = new Command();

function printCommercialHook(): void {
  console.log(chalk.gray("\n────────────────────────────────────────────────────────────"));
  console.log(chalk.bold.yellow("💡 Want more? Unlock 4-Engine Benchmarks & 24/7 AI Citation Monitoring:"));
  console.log(chalk.white("  • Concurrent coverage: ChatGPT Search + Perplexity + Google AIO + Gemini"));
  console.log(chalk.white("  • Competitor Entity Gap Diff & CMS dynamic remediation patches"));
  console.log(chalk.white("  • Agency white-label client portal & executive PDF proposals"));
  console.log(chalk.cyan("  👉 Claim 3 Free Multi-Model Probes: ") + chalk.bold.underline.green("https://geofn.com"));
  console.log(chalk.gray("────────────────────────────────────────────────────────────\n"));
}

program
  .name("open-geo")
  .description("🚀 AI-Native Generative Engine Optimization (GEO) & Technical Audit CLI (Community Edition)")
  .version(VERSION);

// 1. Command: Audit Webpage for GEO Readiness (Primary Community Hook)
program
  .command("audit")
  .description("Perform zero-dependency technical GEO & AI crawlability audit on a target webpage")
  .argument("<url>", "Target webpage URL (e.g. 'https://example.com')")
  .option("-o, --output <path>", "Report markdown output file path")
  .option("-f, --force", "Force overwrite output file if it already exists", false)
  .action(async (url, options) => {
    console.log(chalk.bold.cyan(`\n🛠️ Auditing target webpage: ${chalk.yellow(url)}`));
    const spinner = ora("Analyzing HTML structure, Schema.org, llms.txt, and AI crawler rules...").start();

    try {
      const auditResult = await auditWebpage(url);
      spinner.succeed(chalk.green("Audit complete!"));

      const reportMarkdown = formatAuditMarkdownReport(auditResult);
      if (options.output) {
        await safeAtomicWrite(options.output, reportMarkdown, { force: options.force });
        console.log(chalk.gray(`\n📄 Audit report saved to: `) + chalk.underline.blue(path.resolve(options.output)));
      }

      console.log("\n" + chalk.bold.green("📋 Audit Summary:"));
      console.log(chalk.white(`• Health Score: `) + chalk.bold.yellow(`${auditResult.score} / 100`));
      let schemaStatus = chalk.red("Missing");
      if (auditResult.schemaMarkup.hasJsonLd) {
        if (auditResult.schemaMarkup.deliveryMethod === "dynamic_rsc") {
          schemaStatus = chalk.yellow("Dynamic RSC (⚠️ AI Crawler Risk)");
        } else if (auditResult.schemaMarkup.deliveryMethod === "dynamic_js") {
          schemaStatus = chalk.yellow("Client Script (⚠️ AI Crawler Risk)");
        } else {
          schemaStatus = chalk.green("Configured (Static HTML)");
        }
      }
      console.log(chalk.white(`• JSON-LD Structured Data: `) + schemaStatus);
      console.log(chalk.white(`• AI Search Crawler Access: `) + (auditResult.aiCrawlability.allowsAiBots ? chalk.green("Allowed") : chalk.red("Blocked")));

      if (auditResult.recommendations.length > 0) {
        console.log(chalk.bold.yellow("\n💡 Recommended Action Items:"));
        auditResult.recommendations.forEach((rec, i) => {
          console.log(chalk.gray(`  ${i + 1}. `) + rec);
        });
      }

      printCommercialHook();
    } catch (err: any) {
      spinner.fail(chalk.red(`Audit failed: ${err.message}`));
      process.exit(1);
    }
  });

// 2. Command: Generate llms.txt
program
  .command("generate-llms")
  .description("Crawl website and generate standard /llms.txt and /llms-full.md specifications")
  .argument("<url>", "Target website homepage URL (e.g. 'https://example.com')")
  .option("-o, --output <path>", "Output directory or file path (default: ./llms.txt)", "./llms.txt")
  .option("--full", "Also generate comprehensive llms-full.md documentation", false)
  .option("-f, --force", "Force overwrite output file if it already exists", false)
  .action(async (url, options) => {
    console.log(chalk.bold.cyan(`\n📑 Generating llms.txt for website: ${chalk.yellow(url)}`));
    const spinner = ora("Crawling site architecture and core page summaries...").start();

    try {
      const result = await generateLlmsTxt({
        url,
        includeFull: options.full,
      });

      spinner.succeed(chalk.green(`Successfully indexed ${result.pagesIncluded} pages and generated standards!`));

      await safeAtomicWrite(options.output, result.llmsTxt, { force: options.force });
      console.log(chalk.gray(`\n📄 llms.txt saved to: `) + chalk.underline.blue(path.resolve(options.output)));

      if (options.full && result.llmsFullMd) {
        const fullPath = options.output.replace(/llms\.txt$/i, "llms-full.md");
        await safeAtomicWrite(fullPath, result.llmsFullMd, { force: options.force });
        console.log(chalk.gray(`📄 llms-full.md saved to: `) + chalk.underline.blue(path.resolve(fullPath)));
      }

      printCommercialHook();
    } catch (err: any) {
      spinner.fail(chalk.red(`Generation failed: ${err.message}`));
      process.exit(1);
    }
  });

// 3. Command: Generate FAQ & Schema.org JSON-LD
program
  .command("generate-faq")
  .description("Synthesize high-value FAQ Q&As and Schema.org FAQPage JSON-LD from URL or text")
  .argument("<urlOrText>", "Webpage URL or raw text content")
  .option("-o, --output <path>", "Output Markdown file path")
  .option("-c, --count <count>", "Number of FAQ items to generate", "6")
  .option("-f, --force", "Force overwrite output file if it already exists", false)
  .action(async (urlOrText, options) => {
    console.log(chalk.bold.cyan(`\n❓ Generating high-value FAQs and JSON-LD Schema...`));
    const spinner = ora("Extracting core questions and synthesizing structured data...").start();

    try {
      const isUrl = /^https?:\/\//i.test(urlOrText);
      const result = await generateFaq({
        url: isUrl ? urlOrText : undefined,
        text: isUrl ? undefined : urlOrText,
        count: parseInt(options.count, 10),
      });

      spinner.succeed(chalk.green(`Successfully generated ${result.faqs.length} core FAQ items!`));

      const fullOutput = `${result.markdown}\n\n## 🏷️ Schema.org FAQPage JSON-LD\n\`\`\`html\n${result.jsonLdSchema}\n\`\`\``;

      if (options.output) {
        await safeAtomicWrite(options.output, fullOutput, { force: options.force });
        console.log(chalk.gray(`\n📄 FAQ report saved to: `) + chalk.underline.blue(path.resolve(options.output)));
      } else {
        console.log("\n" + fullOutput);
      }

      printCommercialHook();
    } catch (err: any) {
      spinner.fail(chalk.red(`Generation failed: ${err.message}`));
      process.exit(1);
    }
  });

// 4. Command: Free Keyword Suggestions
program
  .command("keywords")
  .description("Fetch real-time Google & Bing search suggestions and intent stages")
  .argument("<seed>", "Core seed keyword (e.g. 'ai code review')")
  .action(async (seed) => {
    console.log(chalk.bold.cyan(`\n🔑 Mining search intent keywords: ${chalk.yellow(seed)}`));
    const spinner = ora("Fetching suggestions from public search engines...").start();

    try {
      const suggestions = await getUnifiedSuggestions([seed]);
      spinner.succeed(chalk.green(`Successfully retrieved ${suggestions.length} long-tail intent keywords!`));

      console.log("\n" + chalk.bold("Intent Keyword Groups:"));
      suggestions.forEach((s) => {
        const stageColor =
          s.intentStage === "BoFU"
            ? chalk.magenta("[BoFU/Conversion]")
            : s.intentStage === "MoFU"
            ? chalk.cyan("[MoFU/Comparison]")
            : chalk.gray("[ToFU/Informational]");
        console.log(`  ${stageColor} ${chalk.white(s.query)} ${chalk.gray(`(${s.source})`)}`);
      });

      printCommercialHook();
    } catch (err: any) {
      spinner.fail(chalk.red(`Retrieval failed: ${err.message}`));
      process.exit(1);
    }
  });

// 5. Command: Query Fan-out Analysis
program
  .command("fanout")
  .description("Perform 5-dimensional Query Fan-out decomposition and check brand coverage")
  .argument("<topic>", "Seed topic (e.g. 'ai video generator')")
  .option("-d, --domain <domain>", "Target brand domain")
  .option("-i, --industry <industry>", "Industry category or vertical")
  .option("-o, --output <path>", "Report output file path")
  .option("-f, --force", "Force overwrite output file if it already exists", false)
  .action(async (topic, options) => {
    console.log(chalk.bold.cyan(`\n🌐 Performing Query Fan-out intent analysis: ${chalk.yellow(topic)}`));
    const spinner = ora("Decomposing 5-dimensional intents and verifying search signals...").start();

    try {
      const fanoutResult = await analyzeQueryFanout({
        topic,
        domain: options.domain,
        industry: options.industry || topic,
      });

      spinner.succeed(chalk.green(`Successfully fanned out ${fanoutResult.totalQueries} sub-queries!`));

      if (options.output) {
        const reportMarkdown = formatFanoutMarkdownReport(fanoutResult);
        await safeAtomicWrite(options.output, reportMarkdown, { force: options.force });
        console.log(chalk.gray(`\n📄 Analysis report saved to: `) + chalk.underline.blue(path.resolve(options.output)));
      }

      if (fanoutResult.coverage) {
        console.log("\n" + chalk.bold.green("🎯 Brand Fan-out Coverage:"));
        console.log(
          chalk.white(`• Coverage Rate: `) +
            chalk.bold.yellow(`${fanoutResult.coverage.coverageRate}%`) +
            chalk.gray(` (${fanoutResult.coverage.covered} / ${fanoutResult.coverage.total})`)
        );
      }

      printCommercialHook();
    } catch (err: any) {
      spinner.fail(chalk.red(`Analysis failed: ${err.message}`));
      process.exit(1);
    }
  });

// 6. Command: Probe Single Model Visibility
program
  .command("probe")
  .description("Probe brand visibility in a single LLM model (OpenRouter, Gemini, DeepSeek, or offline simulation)")
  .argument("<brand>", "Target brand name or domain (e.g. 'geofn.com' or 'Stripe')")
  .option("-d, --domain <domain>", "Target brand official domain (e.g. 'geofn.com')")
  .option("-i, --industry <industry>", "Industry vertical classification")
  .option("-m, --model <model>", "LLM model to probe (auto-detected from .env if omitted)")
  .option("-o, --output <path>", "Report output file path (default: ./geo-report.md)")
  .option("-f, --force", "Force overwrite output file if it already exists", false)
  .action(async (brand, options) => {
    let targetBrand = brand.trim();
    let targetDomain = options.domain?.trim();

    // Intelligent domain inference: if brand looks like a domain and domain option was omitted
    if (!targetDomain && targetBrand.includes(".")) {
      targetDomain = targetBrand.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      targetBrand = targetDomain.split(".")[0];
    } else if (!targetDomain) {
      targetDomain = "example.com";
    }

    const displayModel = options.model || "auto-detected";
    console.log(chalk.bold.cyan(`\n🔍 Launching single-model probe: ${chalk.yellow(targetBrand)} (${targetDomain}) [${displayModel}]`));
    const spinner = ora("Executing probe across buyer journey prompts...").start();

    try {
      const scorecard = await runCommunityProbe({
        brand: targetBrand,
        domain: targetDomain,
        industry: options.industry,
        model: options.model,
      });

      spinner.succeed(chalk.green("Probe complete! Generating GEO report..."));

      const reportMarkdown = formatGeoMarkdownReport(scorecard);
      const outputPath = options.output || "./geo-report.md";
      await safeAtomicWrite(outputPath, reportMarkdown, { force: options.force });

      const isSimulated = scorecard.results.some((r) => r.isSimulated);
      if (isSimulated) {
        console.log(chalk.bold.yellow("\n⚠️  [ZERO-TOKEN SIMULATION MODE]"));
        console.log(
          chalk.gray(
            "   Executed using offline heuristic baseline. For live LLM evaluations with real web citations, configure OPENROUTER_API_KEY (or GEMINI_API_KEY) in your .env file."
          )
        );
      }

      const totalMentions = scorecard.results.filter((r) => r.brandMentioned).length;
      const awarenessRate = scorecard.totalProbes > 0 ? Math.round((totalMentions / scorecard.totalProbes) * 100) : 0;

      console.log("\n" + chalk.bold.green("📊 GEO Visibility & Funnel Metrics:"));
      console.log(
        chalk.white(`• Top Funnel (Brand Awareness): `) +
          chalk.bold.yellow(`${awarenessRate}%`) +
          chalk.gray(` (${totalMentions}/${scorecard.totalProbes} queries mentioned)`)
      );
      console.log(
        chalk.white(`• Mid Funnel (Top-3 Preferred Rate): `) + chalk.bold.cyan(`${scorecard.top3RecommendationRate}%`)
      );
      console.log(
        chalk.white(`• Bottom Funnel (Official Citation Share): `) + chalk.bold.magenta(`${scorecard.citationShare}%`)
      );
      console.log(
        chalk.white(`• Composite GEO Visibility Index: `) + chalk.bold.green(`${scorecard.visibilityScore} / 100`)
      );
      console.log(chalk.gray(`\n📄 Detailed report saved to: `) + chalk.underline.blue(path.resolve(outputPath)));

      printCommercialHook();
    } catch (err: any) {
      spinner.fail(chalk.red(`Probe failed: ${err.message}`));
      process.exit(1);
    }
  });

// 7. Command: Start MCP Server
program
  .command("mcp")
  .description("Start Model Context Protocol (MCP) standard server for Cursor / Claude Code")
  .action(async () => {
    await startMcpServer();
  });

program.parse(process.argv);
