import { USER_AGENT as DEFAULT_USER_AGENT } from "./version.js";
import { validatePublicUrl } from "./security.js";

export interface SafeFetchOptions {
  timeoutMs?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  allowPrivate?: boolean;
}

export interface SafeFetchResult {
  ok: boolean;
  text?: string;
  status?: number;
  error?: string;
  isTimeout?: boolean;
  latencyMs: number;
  url: string;
}

/**
 * Robust, shared HTTP fetch utility with timeout, User-Agent standardization,
 * SSRF guard, and structured error reporting.
 */
export async function safeFetchText(
  targetUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const start = Date.now();
  const timeoutMs = options.timeoutMs ?? 8000;

  // 1. SSRF and URL structure validation
  const urlCheck = validatePublicUrl(targetUrl, { allowPrivate: options.allowPrivate });
  if (!urlCheck.isValid || !urlCheck.normalizedUrl) {
    return {
      ok: false,
      url: targetUrl,
      error: urlCheck.error || "Invalid URL",
      latencyMs: Date.now() - start,
    };
  }

  const normalizedUrl = urlCheck.normalizedUrl;

  try {
    const res = await fetch(normalizedUrl, {
      headers: {
        "User-Agent": options.userAgent ?? DEFAULT_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        ...options.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return {
        ok: false,
        url: normalizedUrl,
        status: res.status,
        error: `HTTP ${res.status}: ${res.statusText}`,
        latencyMs: Date.now() - start,
      };
    }

    const text = await res.text();
    return {
      ok: true,
      url: normalizedUrl,
      text,
      status: res.status,
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    const isTimeout = err.name === "TimeoutError" || err.message?.includes("timed out");
    return {
      ok: false,
      url: normalizedUrl,
      error: isTimeout ? `Request timed out after ${timeoutMs}ms` : err.message,
      isTimeout,
      latencyMs: Date.now() - start,
    };
  }
}
