import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { Ajv } from "ajv";
import { createTestPackJsonSchema } from "../test-pack-json-schema.js";

const schemaPath = resolve(__dirname, "../../schema/test-pack.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;

function compileSchema() {
  return new Ajv({ allowUnionTypes: true }).compile(schema);
}

describe("test-pack JSON Schema", () => {
  it("matches the generated Zod JSON Schema", () => {
    expect(schema).toEqual(createTestPackJsonSchema());
  });

  it("validates every example test pack", () => {
    const validate = compileSchema();
    const testsDir = resolve(__dirname, "../../../../examples/tests");
    const files = readdirSync(testsDir).filter((name) => name.endsWith(".yaml"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = readFileSync(join(testsDir, file), "utf8");
      const parsed = parseYaml(raw, { merge: true }) as unknown;
      const valid = validate(parsed);
      expect(
        valid,
        `${file}: ${JSON.stringify(validate.errors?.slice(0, 3), null, 2)}`,
      ).toBe(true);
    }
  });

  it("validates typed runtime assertion entries", () => {
    const validate = compileSchema();
    const valid = validate({
      skill: "../skills/bugfix-workflow",
      tests: [{
        prompt: "Fix the bug",
        expect: [
          { "file.exists": { path: "app.js" } },
          { "tool.called": { tool: "Edit", args_match: { path: "app.js" } } },
        ],
      }],
    });

    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("rejects typed runtime assertion entries with args from another check", () => {
    const validate = compileSchema();
    const valid = validate({
      skill: "../skills/bugfix-workflow",
      tests: [{ prompt: "Fix the bug", expect: [{ "file.exists": { run: "./verify.sh" } }] }],
    });

    expect(valid).toBe(false);
  });

  it("requires a selector for tool.not_called", () => {
    const validate = compileSchema();
    const valid = validate({
      skill: "../skills/bugfix-workflow",
      tests: [{ prompt: "Fix the bug", expect: [{ "tool.not_called": {} }] }],
    });

    expect(valid).toBe(false);
  });
});
