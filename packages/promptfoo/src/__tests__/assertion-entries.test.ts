import { describe, expect, it } from "vitest";
import { parseAssertionEntries, parseRuntimeTestFields } from "../assertion-entries.js";

describe("parseAssertionEntries", () => {
  it("rejects legacy string and typed-object entries", () => {
    const result = parseAssertionEntries([
      "file.exists",
      { type: "file.exists", path: "app.js" },
    ], "should");
    expect(result.entries).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });

  it("parses single-key object entries", () => {
    expect(parseAssertionEntries([{ "file.contains": { path: "app.js", text: "ok" } }], "should").entries).toEqual([
      { type: "file.contains", args: { path: "app.js", text: "ok" } },
    ]);
  });

  it("returns entries and diagnostics for malformed authoring", () => {
    const r = parseAssertionEntries(
      [
        { "file.exists": { path: "app.js" } },
        { "file.contains": "app.js" },
        { type: 1 },
        { a: {}, b: {} },
      ],
      "should",
    );
    expect(r.entries).toEqual([
      { type: "file.exists", args: { path: "app.js" } },
    ]);
    expect(r.errors.map((e) => e.reason)).toEqual([
      'shorthand assertion "file.contains" value must be an object',
      'shorthand assertion "type" value must be an object',
      "shorthand assertion object must have exactly one key",
    ]);
  });

  it("reports non-array fields", () => {
    const r = parseAssertionEntries({ "file.exists": { path: "app.js" } }, "should");
    expect(r.entries).toEqual([]);
    expect(r.errors[0]?.reason).toMatch(/must be an array/);
  });

  it("allows missing fields when requested", () => {
    expect(parseAssertionEntries(undefined, "should", { allowMissing: true })).toEqual({
      entries: [],
      errors: [],
    });
  });

  it("parses the single public expect list", () => {
    const result = parseRuntimeTestFields({
      expect: [{ "tool.not_called": { tool: "Bash" } }],
    });
    expect(result.expect).toEqual([
      { type: "tool.not_called", args: { tool: "Bash" } },
    ]);
    expect(result.errors).toEqual([]);
  });
});
