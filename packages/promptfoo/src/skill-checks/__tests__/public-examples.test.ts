import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const examplesDir = join(repoRoot, "examples");

describe("public examples", () => {
  it("keep mocked and intentionally broken maintainer fixtures out of examples", () => {
    const files = execFileSync("find", [
      examplesDir,
      "-path",
      join(examplesDir, "node_modules"),
      "-prune",
      "-o",
      "-path",
      join(examplesDir, ".venv"),
      "-prune",
      "-o",
      "-path",
      join(examplesDir, "mcp/.venv"),
      "-prune",
      "-o",
      "-path",
      join(examplesDir, "mcp/__pycache__"),
      "-prune",
      "-o",
      "-type",
      "f",
      "-print",
    ], {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);

    const forbiddenPathPattern = /(^|\/)(_broken|agents\/.*stub|scripts\/check-promptfoo-node|expect-skill-checks-fails)/;
    const forbiddenContentPattern = /internal-test-json|expect-skill-checks-fails|check-promptfoo-node/;

    const badPaths = files
      .map((file) => relative(examplesDir, file))
      .filter((file) => forbiddenPathPattern.test(file));
    const badContents = files
      .filter((file) => statSync(file).size < 1_000_000)
      .filter((file) => forbiddenContentPattern.test(readFileSync(file, "utf8")))
      .map((file) => relative(examplesDir, file));

    expect({ badPaths, badContents }).toEqual({
      badPaths: [],
      badContents: [],
    });
  });
});
