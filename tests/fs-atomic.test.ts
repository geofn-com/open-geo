import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { safeAtomicWrite, FileExistsError } from "../src/lib/fs-atomic.js";

describe("safeAtomicWrite (Atomic & Safe Overwrite)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "open-geo-atomic-test-"));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("should write file normally when it does not exist", async () => {
    const targetFile = path.join(tempDir, "llms.txt");
    const content = "# Title\n> summary";

    await safeAtomicWrite(targetFile, content);

    const saved = await fs.readFile(targetFile, "utf-8");
    expect(saved).toBe(content);
  });

  it("should create non-existent parent directories automatically", async () => {
    const targetFile = path.join(tempDir, "nested", "sub", "geo-report.md");
    const content = "# Deep report";

    await safeAtomicWrite(targetFile, content);

    const saved = await fs.readFile(targetFile, "utf-8");
    expect(saved).toBe(content);
  });

  it("should throw FileExistsError and preserve original content if file exists and force is not set", async () => {
    const targetFile = path.join(tempDir, "geo-report.md");
    const initialContent = "ORIGINAL_GOOD_CONTENT";
    await fs.writeFile(targetFile, initialContent, "utf-8");

    await expect(
      safeAtomicWrite(targetFile, "NEW_MALFORMED_CONTENT")
    ).rejects.toThrow(FileExistsError);

    // Verify original content was NOT clobbered
    const preserved = await fs.readFile(targetFile, "utf-8");
    expect(preserved).toBe(initialContent);
  });

  it("should successfully overwrite existing file when force is true", async () => {
    const targetFile = path.join(tempDir, "llms.txt");
    await fs.writeFile(targetFile, "OLD_CONTENT", "utf-8");

    const newContent = "NEW_FORCE_OVERWRITTEN_CONTENT";
    await safeAtomicWrite(targetFile, newContent, { force: true });

    const saved = await fs.readFile(targetFile, "utf-8");
    expect(saved).toBe(newContent);
  });

  it("should not leave temporary files behind after successful atomic write", async () => {
    const targetFile = path.join(tempDir, "output.md");
    await safeAtomicWrite(targetFile, "Sample text");

    const filesInDir = await fs.readdir(tempDir);
    expect(filesInDir).toEqual(["output.md"]);
  });
});
