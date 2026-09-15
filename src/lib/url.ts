/**
 * Normalizes input URL string, automatically prepending 'https://' if protocol is omitted.
 * Handles inputs like 'tryprofound.com', 'www.example.com/blog', 'http://localhost:3000'
 */
export function normalizeUrl(input: string): string {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
