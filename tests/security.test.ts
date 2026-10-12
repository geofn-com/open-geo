import { describe, it, expect } from "vitest";
import { isPrivateHost, validatePublicUrl, PublicUrlSchema } from "../src/lib/security.js";

describe("Security Module (SSRF Defense & Public URL Validation)", () => {
  it("detects loopback and private IPv4 ranges", () => {
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("127.0.1.5")).toBe(true);
    expect(isPrivateHost("10.0.0.1")).toBe(true);
    expect(isPrivateHost("172.16.0.1")).toBe(true);
    expect(isPrivateHost("172.31.255.255")).toBe(true);
    expect(isPrivateHost("192.168.1.1")).toBe(true);
  });

  it("detects cloud metadata IP 169.254.169.254", () => {
    expect(isPrivateHost("169.254.169.254")).toBe(true);
    expect(isPrivateHost("169.254.1.1")).toBe(true);
  });

  it("detects localhost and internal domain names", () => {
    expect(isPrivateHost("localhost")).toBe(true);
    expect(isPrivateHost("api.internal")).toBe(true);
    expect(isPrivateHost("service.local")).toBe(true);
    expect(isPrivateHost("router.lan")).toBe(true);
  });

  it("allows valid public domain names", () => {
    expect(isPrivateHost("geofn.com")).toBe(false);
    expect(isPrivateHost("docs.github.com")).toBe(false);
    expect(isPrivateHost("openai.com")).toBe(false);
  });

  it("validates and normalizes public URLs correctly", () => {
    const res1 = validatePublicUrl("geofn.com");
    expect(res1.isValid).toBe(true);
    expect(res1.normalizedUrl).toBe("https://geofn.com/");

    const res2 = validatePublicUrl("http://example.com/about");
    expect(res2.isValid).toBe(true);
    expect(res2.normalizedUrl).toBe("http://example.com/about");
  });

  it("blocks private host URLs by default", () => {
    const res1 = validatePublicUrl("http://localhost:6379");
    expect(res1.isValid).toBe(false);
    expect(res1.error).toContain("private");

    const res2 = validatePublicUrl("http://169.254.169.254/latest/meta-data/");
    expect(res2.isValid).toBe(false);
    expect(res2.error).toContain("SSRF blocked");
  });

  it("PublicUrlSchema parses valid URLs and rejects invalid/private inputs", () => {
    expect(() => PublicUrlSchema.parse("geofn.com")).not.toThrow();
    expect(PublicUrlSchema.parse("geofn.com")).toBe("https://geofn.com");

    expect(() => PublicUrlSchema.parse("http://127.0.0.1")).toThrow();
    expect(() => PublicUrlSchema.parse("")).toThrow();
    expect(() => PublicUrlSchema.parse("ftp://geofn.com")).toThrow();
  });
});
