export interface KeywordSuggestion {
  query: string;
  source: "google" | "bing" | "paa" | "synthetic";
  intentStage?: "ToFU" | "MoFU" | "BoFU";
}

export interface SyntheticPrompt {
  id: string;
  title: string;
  prompt: string;
  query?: string;
  stage: "ToFU" | "MoFU" | "BoFU";
  intent: "informational" | "comparative" | "transactional";
}

export interface ProberResult {
  model: string;
  promptId: string;
  promptText: string;
  query?: string;
  stage?: "ToFU" | "MoFU" | "BoFU";
  rawResponse: string;
  brandMentioned: boolean;
  mentionIndex: number; // 0-indexed ranking in recommendation list, or -1
  sentiment: "positive" | "neutral" | "negative" | "none";
  citedUrls: string[];
  brandDomainCited: boolean;
  latencyMs: number;
  isSimulated?: boolean;
}

export interface GeoScorecard {
  brand: string;
  domain: string;
  totalProbes: number;
  visibilityScore: number; // 0 - 100
  citationShare: number; // 0 - 100%
  top3RecommendationRate: number; // 0 - 100%
  knowledgeGaps: string[];
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
    none: number;
  };
  modelPerformance: Record<
    string,
    {
      mentionedCount: number;
      total: number;
      citationCount: number;
      avgMentionRank: number;
    }
  >;
  results: ProberResult[];
  audit?: TechnicalAuditReport;
}

export interface TechnicalAuditReport {
  url: string;
  timestamp: string;
  score: number; // 0 - 100
  llmsTxt: {
    hasLlmsTxt: boolean;
    hasLlmsFullTxt: boolean;
    url?: string;
    details: string;
  };
  schemaMarkup: {
    hasJsonLd: boolean;
    schemaTypes: string[];
    details: string;
    deliveryMethod?: "static" | "dynamic_rsc" | "dynamic_js" | "none";
  };
  headings: {
    h1Count: number;
    h2Count: number;
    hierarchyValid: boolean;
  };
  meta: {
    title?: string;
    description?: string;
    openGraph: Record<string, string>;
    canonical?: string;
  };
  aiCrawlability: {
    allowsAiBots: boolean;
    robotsTxtStatus: string;
    blockedBots: string[];
  };
  recommendations: string[];
}

// -------------------------------------------------------------
// Query Fan-out Types
// -------------------------------------------------------------

export interface QueryItem {
  query: string;
  normalizedRoot: string;
  searchSignal: "high" | "medium" | "low" | "emerging";
  brandMentioned?: boolean;
  mentionRank?: number;
  priority: "critical" | "high" | "medium";
  suggestedAction: string;
}

export interface IntentGroup {
  intent: "informational" | "commercial" | "comparison" | "transactional" | "trust";
  label: string;
  queries: QueryItem[];
}

export interface CoverageReport {
  domain: string;
  covered: number;
  total: number;
  coverageRate: number; // %
  criticalGaps: QueryItem[];
}

export interface FanoutOutput {
  topic: string;
  industry: string;
  totalQueries: number;
  groups: IntentGroup[];
  coverage?: CoverageReport;
}

export interface FanoutInput {
  topic: string;
  domain?: string;
  industry?: string;
  geo?: string;
  maxQueriesPerGroup?: number;
  probeDepth?: "quick" | "full";
}

// -------------------------------------------------------------
// llms.txt & FAQ Generator Types
// -------------------------------------------------------------

export interface PageInfo {
  url: string;
  title: string;
  description: string;
  h1: string;
  category: "product" | "docs" | "about" | "blog" | "other";
  priority: number;
}

export interface LlmsTxtOutput {
  url: string;
  siteName: string;
  description: string;
  llmsTxt: string;
  llmsFullMd?: string;
  pagesIncluded: number;
  pages: PageInfo[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqOutput {
  sourceUrl?: string;
  faqs: FaqItem[];
  jsonLdSchema: string;
  markdown: string;
}

// -------------------------------------------------------------
// Zero-Token MCP Analyzer Types
// -------------------------------------------------------------

export interface DiscoveryStackReport {
  url: string;
  score: number; // 0 - 100
  rating: "excellent" | "good" | "fair" | "poor";
  stack: {
    llmsTxt: boolean;
    llmsFullTxt: boolean;
    agentsJson: boolean;
    robotsTxtAiCrawlers: boolean;
    mcpJson: boolean;
    agentCard: boolean;
    jsonLd: boolean;
    sitemap: boolean;
    faqSchema: boolean;
  };
  details: {
    llmsTxtUrl?: string;
    agentsJsonUrl?: string;
    mcpJsonUrl?: string;
    agentCardUrl?: string;
    sitemapUrl?: string;
  };
  recommendations: string[];
}

export type AiBotCategory = "search" | "training" | "mixed" | "agent";

export interface BotAuditStatus {
  botName: string;
  userAgent: string;
  category: AiBotCategory;
  owner: string;
  allowed: boolean;
  ruleMatched?: string;
  recommendation: "allow" | "block" | "conditional";
  reason: string;
}

export interface RobotsAuditReport {
  url: string;
  robotsTxtFound: boolean;
  contentSignalHeader?: string;
  totalBotsAudited: number;
  allowedCount: number;
  blockedCount: number;
  searchBotsAllowedRate: number; // %
  trainingBotsBlockedRate: number; // %
  fatalPatterns: {
    allBlockedByWildcard: boolean;
    nextJsBundlesBlocked: boolean;
    apiEndpointsBlocked: boolean;
    sitemapMissing: boolean;
  };
  botMatrix: BotAuditStatus[];
  recommendations: string[];
}

export interface ContentDimensionScore {
  dimension: string;
  label: string;
  score: number; // 0 - 100
  impact: "high" | "medium" | "low";
  findings: string;
  geoReference?: string; // e.g. "KDD 2024: +30-40% citation rate"
}

export interface ContentAuditReport {
  url: string;
  overallScore: number; // 0 - 100
  pageType: {
    type: string;
    source: "json-ld" | "heuristic" | "meta";
  };
  wordCount: number;
  readingTimeMinutes: number;
  dimensions: ContentDimensionScore[];
  topRecommendations: Array<{
    priority: number;
    dimension: string;
    advice: string;
    geoReference: string;
  }>;
}

export interface EntityVariant {
  variant: string;
  count: number;
  locations: string[]; // e.g. ["title", "h1", "json-ld", "body"]
}

export interface EntityConsistencyReport {
  url: string;
  canonicalBrand: string;
  detectedBrand: string;
  pageConsistencyRate: number; // 0 - 100%
  status: "perfect" | "minor-drift" | "severe-drift" | "unknown";
  variants: EntityVariant[];
  recommendations: string[];
}

export interface GeoSimulateReport {
  url: string;
  domain: string;
  estimatedScore: number; // 0 - 100
  confidence: "high" | "medium" | "low";
  subScores: {
    brandAwareness: number; // 0 - 100
    citationStrength: number; // 0 - 100
    shareOfVoice: number; // 0 - 100
    sentiment: number; // 0 - 100
    discoveryStack: number; // 0 - 100
    contentQuality: number; // 0 - 100
  };
  keyFindings: string[];
  recommendations: string[];
}

export interface VerifiedCitation {
  url: string;
  status: "reachable" | "unreachable" | "skipped";
  httpStatus?: number;
  domain: string;
  error?: string;
}

export interface ClaimExtraction {
  claim: string;
  type: "metric" | "currency" | "percentage" | "certification" | "scale";
  context: string;
}

export interface AnalyzeResponseReport {
  brandMentioned: boolean;
  brandRank: number; // 0-indexed ranking or -1
  brandContextSnippet?: string;
  detectedCompetitors: string[];
  sentiment: {
    score: number; // -1.0 to +1.0
    label: "positive" | "neutral" | "negative";
    positiveKeywords: string[];
    negativeKeywords: string[];
  };
  extractedUrls: string[];
  verifiedCitations?: VerifiedCitation[];
  verificationSummary?: {
    total: number;
    reachable: number;
    unreachable: number;
    reachableRate: number; // 0 - 1.0
    hallucinationAlert: boolean;
  };
  extractedClaims?: ClaimExtraction[];
}

// -------------------------------------------------------------
// Citation Sources & Channel Opportunity Types (GEOly 3.2)
// -------------------------------------------------------------

export type CitationChannelCategory =
  | "community_forum" // Reddit, Quora, StackOverflow
  | "review_directory" // G2, Capterra, ProductHunt, Trustpilot
  | "tech_documentation" // GitHub, Dev Docs, Specs
  | "media_editorial" // TechCrunch, Medium, Substack, Forbes
  | "wiki_knowledge" // Wikipedia, Wikidata
  | "official_vendor" // Official brand sites
  | "other";

export interface CitationSourceHub {
  domain: string;
  count: number;
  share: number; // % (0 - 100)
  category: CitationChannelCategory;
  categoryLabel: string;
  sampleUrls: string[];
  opportunityAdvice: string;
}

export interface CitationSourcesReport {
  topicOrIndustry: string;
  totalCitationsAnalyzed: number;
  uniqueDomainsCount: number;
  categoryBreakdown: Record<CitationChannelCategory, { count: number; share: number }>;
  topHubs: CitationSourceHub[];
  targetDomainPerformance?: {
    domain: string;
    citationsCount: number;
    shareOfCitations: number; // %
    rank: number;
  };
  distributionActionPlan: string[];
}

// -------------------------------------------------------------
// Topic Competition & White-Space Radar Types (GEOly 3.3)
// -------------------------------------------------------------

export interface SubQueryCompetition {
  query: string;
  intent: "informational" | "commercial" | "comparison" | "transactional" | "trust";
  difficultyScore: number; // 0 - 100
  landscape: "monopolized" | "competitive" | "fragmented" | "white_space";
  dominantBrand?: string;
  brandMentionsCount: number;
  searchSignal: "high" | "medium" | "low" | "emerging";
  whiteSpaceOpportunity: boolean;
  strategicAction: string;
}

export interface TopicCompetitionReport {
  topic: string;
  industry: string;
  overallDifficulty: number; // 0 - 100
  marketLandscape: "monopolized" | "competitive" | "fragmented" | "untapped_blue_ocean";
  totalQueriesAnalyzed: number;
  whiteSpaceCount: number;
  dominantPlayers: Array<{ brand: string; shareOfVoice: number }>;
  whiteSpaceOpportunities: SubQueryCompetition[];
  queriesBreakdown: SubQueryCompetition[];
  strategicPlaybook: string[];
}

// -------------------------------------------------------------
// Retrieval Quality & Crawler Readiness Types
// -------------------------------------------------------------

export interface RetrievalQualityReport {
  url: string;
  overallScore: number; // 0 - 100
  textToHtmlRatio: number; // % (e.g. 15.4%)
  rawHtmlBytes: number;
  extractedTextWords: number;
  jsDependencyRisk: "none" | "low" | "high" | "critical";
  canonicalCheck: {
    hasCanonical: boolean;
    canonicalUrl?: string;
    isSelfReferencing: boolean;
    issue?: string;
  };
  redirectsCount: number;
  findings: string[];
  recommendations: string[];
}

// -------------------------------------------------------------
// Content Freshness Audit Types
// -------------------------------------------------------------

export interface FreshnessPageItem {
  url: string;
  lastModified?: string;
  ageInDays: number;
  status: "fresh" | "moderate" | "stale";
  source: "sitemap_lastmod" | "http_header" | "og_meta" | "schema_date";
}

export interface ContentFreshnessReport {
  domain: string;
  freshnessScore: number; // 0 - 100
  totalPagesAudited: number;
  freshPagesCount: number; // < 30 days
  moderatePagesCount: number; // 30 - 180 days
  stalePagesCount: number; // > 180 days
  averageAgeDays: number;
  pages: FreshnessPageItem[];
  recommendations: string[];
}

// -------------------------------------------------------------
// Universal Schema.org Generator Types
// -------------------------------------------------------------

export interface SchemaGeneratorReport {
  url: string;
  detectedSchemas: string[];
  missingRecommendedSchemas: string[];
  generatedJsonLd: string; // Ready-to-copy HTML <script type="application/ld+json">
  generatedSchemas: Array<{
    type: string;
    jsonLd: Record<string, any>;
  }>;
  validationIssues: string[];
}

// -------------------------------------------------------------
// Failure Typology & Triage Engine Types (OpenGEO Flagship)
// -------------------------------------------------------------

export type GeoFailureCategory =
  | "crawler_blocked" // robots.txt blocks Perplexity, Claude, GPT etc.
  | "discovery_missing" // missing llms.txt, JSON-LD, sitemap
  | "citability_poor" // low stats density, no quotes, unstructured
  | "entity_fragmented" // brand name drift / multiple casing variants
  | "authority_vacuum" // no presence in high-authority AI citation hubs
  | "rendering_opaque"; // pure JS hydration, empty raw HTML

export type FailureSeverity = "P0_BLOCKER" | "P1_CRITICAL" | "P2_MODERATE";

export interface RemediationPatch {
  title: string;
  type: "robots_txt" | "json_ld" | "llms_txt" | "html_heading" | "content_structure";
  fileLocation: string; // e.g. "/robots.txt", "<head> of /index.html"
  codeSnippet: string;
  description: string;
  estimatedEffort: "5_mins" | "30_mins" | "2_hours" | "1_day";
}

export interface FailureDiagnosisItem {
  category: GeoFailureCategory;
  categoryLabel: string;
  severity: FailureSeverity;
  title: string;
  rootCause: string;
  evidence: string[];
  impactScore: number; // 0 - 100
  priorityScore: number; // calculated ROI score
  patches: RemediationPatch[];
}

export interface FailureDiagnosisReport {
  url: string;
  brand: string;
  overallHealthScore: number; // 0 - 100
  primaryBlocker?: {
    category: GeoFailureCategory;
    title: string;
    severity: FailureSeverity;
    remedyOverview: string;
  };
  totalFailuresIdentified: number;
  failureBreakdown: Record<FailureSeverity, number>;
  diagnosedItems: FailureDiagnosisItem[];
  actionableFixes: RemediationPatch[];
  executiveSummary: string;
}
