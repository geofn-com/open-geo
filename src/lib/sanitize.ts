/**
 * Utilities for redacting sensitive secrets, API keys, and credentials from
 * error messages and logs before serialization.
 */

const KEY_PATTERNS = [
  // OpenAI & general sk- patterns (including proj-, org- prefixes)
  /sk-[a-zA-Z0-9_\-]{20,}/g,
  // Google Gemini / Cloud API keys
  /AIza[0-9A-Za-z-_]{35}/g,
  // Anthropic API keys
  /sk-ant-[a-zA-Z0-9_\-]{20,}/g,
  // HTTP Authorization Bearer headers
  /Bearer\s+[a-zA-Z0-9._\-]{10,}/gi,
  // Basic Auth URLs (e.g. http://user:pass@host)
  /(https?:\/\/)[^/:@\s]+:[^/@\s]+@/gi,
];

/**
 * Sanitizes an error or message string by redacting API keys and sensitive tokens.
 */
export function sanitizeError(err: unknown, sensitiveTokens: string[] = []): string {
  if (err === null || err === undefined) {
    return "Unknown error";
  }

  let message = err instanceof Error ? err.message : String(err);

  // 1. Redact explicit caller-supplied tokens (e.g. active API key in scope)
  for (const token of sensitiveTokens) {
    if (token && typeof token === "string" && token.trim().length >= 6) {
      const cleanToken = token.trim();
      // Global replacement of the secret token
      message = message.split(cleanToken).join("[REDACTED_API_KEY]");
    }
  }

  // 2. Redact standard well-known key patterns
  for (const pattern of KEY_PATTERNS) {
    message = message.replace(pattern, (match) => {
      if (match.toLowerCase().startsWith("bearer")) {
        return "Bearer [REDACTED_TOKEN]";
      }
      if (match.includes("://")) {
        return "$1[REDACTED_CREDENTIALS]@";
      }
      return "[REDACTED_KEY]";
    });
  }

  return message;
}
