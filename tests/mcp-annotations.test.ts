import { describe, it, expect } from "vitest";
import { COMMUNITY_MCP_TOOLS } from "../src/mcp/server.js";

describe("MCP Tool Annotations & Safety Hints (M8ven / OpenAI Directory Audit Compliance)", () => {
  it("should declare exactly 8 community MCP tools", () => {
    expect(COMMUNITY_MCP_TOOLS.length).toBe(8);
  });

  it("should have annotations defined on every tool with all 4 required hints as explicit booleans", () => {
    const requiredHints = [
      "readOnlyHint",
      "destructiveHint",
      "idempotentHint",
      "openWorldHint",
    ] as const;

    for (const tool of COMMUNITY_MCP_TOOLS) {
      expect(tool.annotations, `Tool '${tool.name}' is missing annotations object`).toBeDefined();
      expect(typeof tool.annotations).toBe("object");

      for (const hint of requiredHints) {
        expect(
          typeof tool.annotations[hint],
          `Tool '${tool.name}' must have boolean '${hint}', got ${typeof tool.annotations[hint]}`
        ).toBe("boolean");
      }
    }
  });

  it("should accurately reflect non-destructive read-only open-world behavior for all audit & generator tools", () => {
    for (const tool of COMMUNITY_MCP_TOOLS) {
      // All open-geo MCP tools are analytical sensors that don't destroy or mutate host filesystem directly over stdio
      expect(tool.annotations.destructiveHint).toBe(false);
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.idempotentHint).toBe(true);
      expect(tool.annotations.openWorldHint).toBe(true);
    }
  });
});
