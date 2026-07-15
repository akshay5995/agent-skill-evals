#!/usr/bin/env node
/** Agent Skill Evals owns setup and static checks; Promptfoo owns runtime evals. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { AGENT_PRESETS, PRESET_IDS } from "../agent/presets.js";
import { checkSkillProject } from "../skill-checks/check.js";

export interface InitOptions {
  dir?: string;
  adapter?: string;
  skill?: string;
  force?: boolean;
}

export interface InitResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

export interface CliIo {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const SHIMS: Record<string, string> = {
  "agent-skill-evals/agent.mjs": 'export { default } from "agent-skill-evals/agent";\n',
  "agent-skill-evals/assertions.js":
    'import("agent-skill-evals/assertions").then(({ default: grade }) => grade(output, context))\n',
  "agent-skill-evals/test-generator.mjs":
    'export { default } from "agent-skill-evals/test-generator";\n',
};

function promptfooConfig(adapter: string, testsPath: string): string {
  return `description: Agent skill tests (${adapter})

prompts:
  - "{{prompt}}"

providers:
  - id: file://./agent-skill-evals/agent.mjs
    label: ${adapter}-agent
    config:
      preset: ${adapter}
      timeoutMs: 300000

defaultTest:
  options:
    runSerially: true

tests:
  path: file://./agent-skill-evals/test-generator.mjs
  config:
    path: ./${testsPath}
    assertionPath: file://./agent-skill-evals/assertions.js
`;
}

function starterTestPack(skillPathFromPack: string, skillName: string): string {
  return `# yaml-language-server: $schema=../node_modules/agent-skill-evals/schema/test-pack.schema.json
skill: ${skillPathFromPack}

tests:
  - description: ${skillName} produces the expected result
    prompt: "TODO: replace with a realistic request this skill should handle."
    expect:
      - output.contains:
          text: "TODO_EXPECTED_RESULT"
`;
}

export function scaffold(options: InitOptions = {}): InitResult {
  const root = resolve(options.dir ?? ".");
  const adapter = options.adapter ?? "claude-code";
  const result: InitResult = { created: [], skipped: [], errors: [] };
  if (!AGENT_PRESETS[adapter]) {
    result.errors.push(
      `unknown adapter "${adapter}". Supported adapters: ${PRESET_IDS.join(", ")}`,
    );
    return result;
  }

  const skillPath = options.skill ?? "./skills/my-skill";
  const skillName = basename(skillPath.replace(/\/+$/, "")) || "my-skill";
  const testsPath = `tests/${skillName}.yaml`;
  const packDir = dirname(join(root, testsPath));
  const absoluteSkill = resolve(root, skillPath);
  const skillPathFromPack = relative(packDir, absoluteSkill).replaceAll("\\", "/");
  const files: Record<string, string> = {
    ...SHIMS,
    "promptfooconfig.yaml": promptfooConfig(adapter, testsPath),
    [testsPath]: starterTestPack(skillPathFromPack, skillName),
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath);
    if (existsSync(target) && !options.force) {
      result.skipped.push(relativePath);
      continue;
    }
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
      result.created.push(relativePath);
    } catch (error) {
      result.errors.push(
        `${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return result;
}

function optionValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const USAGE = `Usage:
  agent-skill-evals init --skill <path> --adapter <${PRESET_IDS.join("|")}> [--dir <path>] [--force]
  agent-skill-evals check <skill-path> [--tests <pack-path>] [--strict] [--json]

Static checks are local and agent-free. Runtime evaluations continue to use promptfoo eval.
`;

export async function main(
  argv: string[] = process.argv.slice(2),
  io: CliIo = {
    cwd: process.cwd(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
): Promise<number> {
  const command = argv[0];
  if (command === "check") {
    const skillPath = argv[1];
    if (!skillPath || skillPath.startsWith("-")) {
      io.stderr("error: check requires a skill path\n");
      return 1;
    }
    const result = await checkSkillProject({
      cwd: io.cwd,
      skillPath,
      ...(optionValue(argv, "--tests") ? { testPackPath: optionValue(argv, "--tests") } : {}),
      strict: argv.includes("--strict"),
    });
    if (argv.includes("--json")) {
      io.stdout(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      for (const item of result.diagnostics) {
        const target = item.path ? ` (${item.path})` : "";
        io.stdout(`${item.level.toUpperCase()} ${item.code}: ${item.message}${target}\n`);
        if (item.suggestion) io.stdout(`  Fix: ${item.suggestion}\n`);
      }
      io.stdout(result.ok ? "Skill checks passed.\n" : "Skill checks failed.\n");
    }
    return result.ok ? 0 : 1;
  }

  if (command !== "init") {
    io.stdout(USAGE);
    return command ? 1 : 0;
  }

  const result = scaffold({
    dir: optionValue(argv, "--dir") ?? io.cwd,
    adapter: optionValue(argv, "--adapter"),
    skill: optionValue(argv, "--skill"),
    force: argv.includes("--force"),
  });
  for (const file of result.created) io.stdout(`created ${file}\n`);
  for (const file of result.skipped) io.stdout(`skipped ${file} (exists; use --force to overwrite)\n`);
  for (const error of result.errors) io.stderr(`error: ${error}\n`);
  if (result.created.length > 0) {
    const skill = optionValue(argv, "--skill") ?? "./skills/my-skill";
    io.stdout(
      "\nNext steps:\n" +
        `  1. pnpm exec agent-skill-evals check ${skill}\n` +
        "  2. Replace the TODO expectation with a realistic evidence check.\n" +
        "  3. pnpm exec promptfoo eval\n",
    );
  }
  return result.errors.length > 0 ? 1 : 0;
}

const invokedDirectly = (() => {
  if (typeof process.argv[1] !== "string") return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href ||
      import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
