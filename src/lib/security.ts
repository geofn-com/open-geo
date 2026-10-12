import { z } from "zod";

/**
 * Regex patterns identifying private, local, and metadata IP ranges
 */
const PRIVATE_IP_PATTERNS = [
  /^127\./, // 127.0.0.0/8 Loopback
  /^10\./, // 10.0.0.0/8 Private network
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 Private network
  /^192\.168\./, // 192.168.0.0/16 Private network
  /^169\.254\./, // 169.254.0.0/16 Link-local / Cloud metadata (AWS, GCP, Azure)
  /^0\./, // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // Carrier-grade NAT
  /^::1$/, // IPv6 Loopback
  /^fc00:/i, // IPv6 Unique Local Address
  /^fd[0-9a-f]{2}:/i, // IPv6 ULA
  /^fe80:/i, // IPv6 Link-local
];

const PRIVATE_HOST_SUFFIXES = [
  "localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".test",
  ".example",
  ".invalid",
];

/**
 * Determines whether a given hostname or IP corresponds to an internal,
 * private, or cloud-metadata network target (SSRF prevention).
 */
export function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();

  if (!normalized) return true;
  if (normalized === "localhost" || normalized === "0.0.0.0") return true;

  for (const suffix of PRIVATE_HOST_SUFFIXES) {
    if (normalized === suffix || normalized.endsWith(suffix)) {
      return true;
    }
  }

  // Strip IPv6 square brackets if present
  const cleanIp = normalized.replace(/^\[|\]$/g, "");

  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(cleanIp));
}

export interface UrlValidationResult {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
}

/**
 * Validates that an input URL string is a syntactically valid public web URL.
 * Automatically adds 'https://' prefix if protocol is omitted.
 */
export function validatePublicUrl(
  input: string,
  options: { allowPrivate?: boolean } = {}
): UrlValidationResult {
  if (!input || typeof input !== "string") {
    return { isValid: false, error: "Target URL cannot be empty" };
  }

  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }

  try {
    const parsed = new URL(raw);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { isValid: false, error: `Disallowed protocol: '${parsed.protocol}'. Only HTTP(S) supported.` };
    }

    if (!options.allowPrivate && isPrivateHost(parsed.hostname)) {
      return {
        isValid: false,
        error: `Security restriction: Target '${parsed.hostname}' is a private, loopback, or cloud-metadata address (SSRF blocked).`,
      };
    }

    if (!parsed.hostname || !parsed.hostname.includes(".")) {
      // Allow localhost only if explicitly enabled
      if (!options.allowPrivate || parsed.hostname !== "localhost") {
        return { isValid: false, error: `Invalid hostname: '${parsed.hostname}'. Must be a valid FQDN.` };
      }
    }

    return {
      isValid: true,
      normalizedUrl: parsed.toString(),
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: `Malformed URL: ${err.message}`,
    };
  }
}

/**
 * Zod schema for validating public HTTP/HTTPS URLs.
 */
export const PublicUrlSchema = z
  .string()
  .min(1, "URL is required")
  .transform((val: string) => {
    const trimmed = val.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  })
  .superRefine((val: string, ctx: z.RefinementCtx) => {
    const result = validatePublicUrl(val);
    if (!result.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.error || "Invalid public URL",
      });
    }
  });
