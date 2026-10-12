import { describe, it, expect } from "vitest";
import { sanitizeError } from "../src/lib/sanitize.js";

describe("Sanitizer Module (API Key & Secret Redaction)", () => {
  it("redacts standard OpenAI-style sk- keys", () => {
    const rawError = new Error("Failed upstream request with key sk-proj-1234567890abcdef1234567890");
    const sanitized = sanitizeError(rawError);
    expect(sanitized).not.toContain("sk-proj-1234567890abcdef1234567890");
    expect(sanitized).toContain("[REDACTED_KEY]");
  });

  it("redacts Google AI Studio keys", () => {
    const rawError = new Error("API call error: AIzaSyD1234567890abcdefghijklmnopqrstuvw is invalid");
    const sanitized = sanitizeError(rawError);
    expect(sanitized).not.toContain("AIzaSyD1234567890abcdefghijklmnopqrstuvw");
    expect(sanitized).toContain("[REDACTED_KEY]");
  });

  it("redacts caller-specified sensitive tokens", () => {
    const customSecret = "super-secret-openrouter-key-999";
    const rawError = "Unauthorized: token super-secret-openrouter-key-999 was rejected";
    const sanitized = sanitizeError(rawError, [customSecret]);
    expect(sanitized).not.toContain(customSecret);
    expect(sanitized).toContain("[REDACTED_API_KEY]");
  });

  it("redacts Bearer authorization header values", () => {
    const rawError = "Request headers: Bearer my_secret_token_1234567890";
    const sanitized = sanitizeError(rawError);
    expect(sanitized).not.toContain("my_secret_token_1234567890");
    expect(sanitized).toContain("Bearer [REDACTED_TOKEN]");
  });
});
