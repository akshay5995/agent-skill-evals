import { describe, expect, it } from "vitest";
import { parseAssertionEntries, parseRuntimeTestFields } from "../assertion-entries.js";

describe("parseAssertionEntries", () => {
  it("parses string entries", () => {
    expect(parseAssertionEntries(["file.exists"], "should").entries).toEqual([
      { type: "file.exists", args: {} },
    ]);
  });

  it("parses typed object entries", () => {
    const entry = { type: "file.exists", path: "app.js" };
    expect(parseAssertionEntries([entry], "should").entries).toEqual([
      { type: "file.exists", args: entry },
    ]);
  });

  it("parses single-key object entries", () => {
    expect(parseAssertionEntries([{ "file.contains": { path: "app.js", text: "ok" } }], "should").entries).toEqual([
      { type: "file.contains", args: { path: "app.js", text: "ok" } },
    ]);
  });

  it("reports malformed entries", () => {
    const result = parseAssertionEntries([null, 1, [], { a: {}, b: {} }, { type: 1 }], "should");
    expect(result.entries).toEqual([]);
    expect(result.errors).toHaveLength(5);
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
      "`type` must be a non-empty string",
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

  it("rejects double-negative checks under should_not", () => {
    const result = parseRuntimeTestFields({
      should_not: [{ "code.no_pattern": { glob: "**/*.ts", pattern: "TODO" } }],
    });
    expect(result.should_not).toEqual([]);
    expect(result.errors[0]?.reason).toMatch(/must be declared under should/);
  });
});
