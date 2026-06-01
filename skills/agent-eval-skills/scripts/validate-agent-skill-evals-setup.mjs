#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root ?? process.cwd());
const skill = required(args.skill, "--skill is required");
const skillSlug = skill.trim();
const skillPath = args.skillPath ?? `skills/${skillSlug}`;
const testsPath = args.tests ?? `tests/${skillSlug}.yaml`;
const fixturePath = args.fixture ?? `fixtures/${skillSlug}`;
const verifier = args.verifier ?? `verify_${skillSlug.replaceAll("-", "_")}.cjs`;
const agentConfig = args.agentConfig ?? "promptfoo.codex.yaml";
const outputs = listArg(args.output);
const requiredToolCalls = listArg(args.requireToolCalled);
const forbiddenToolCalls = listArg(args.requireToolNotCalled);
const failures = [];
const codexArgsPattern =
  /args:[\s\S]*-\s+--ask-for-approval[\s\S]*-\s+never[\s\S]*-\s+--sandbox[\s\S]*-\s+workspace-write[\s\S]*-\s+exec[\s\S]*-\s+--json[\s\S]*-\s+"-"/;
const skillTestAssertionPattern =
  /assert:[\s\S]*type:\s*javascript[\s\S]*metric:\s*skill\.test[\s\S]*value:\s*file:\/\/\.\/agent-skill-evals\/assertions\.js[\s\S]*config:[\s\S]*metric:\s*skill\.test/;
const skillLoadedIncludesPattern = new RegExp(
  `skill\\.loaded:[\\s\\S]*should_include:[\\s\\S]*-\\s*${escapeRegex(skillSlug)}`,
);

function readText(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath} is missing`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, needle) {
  const text = readText(relativePath);
  if (text && !text.includes(needle)) {
    failures.push(`${relativePath} must contain ${JSON.stringify(needle)}`);
  }
}

function notContains(relativePath, needle) {
  const text = readText(relativePath);
  if (text && text.includes(needle)) {
    failures.push(`${relativePath} must not contain ${JSON.stringify(needle)}`);
  }
}

function matches(relativePath, pattern, description) {
  const text = readText(relativePath);
  if (text && !pattern.test(text)) {
    failures.push(`${relativePath} must ${description}`);
  }
}

function count(relativePath, needle, expected) {
  const text = readText(relativePath);
  if (!text) return;
  const actual = text.split(needle).length - 1;
  if (actual !== expected) {
    failures.push(`${relativePath} must contain ${JSON.stringify(needle)} ${expected} time(s), found ${actual}`);
  }
}

function countAtLeast(relativePath, needle, expected) {
  const text = readText(relativePath);
  if (!text) return;
  const actual = text.split(needle).length - 1;
  if (actual < expected) {
    failures.push(`${relativePath} must contain ${JSON.stringify(needle)} at least ${expected} time(s), found ${actual}`);
  }
}

function runtimeTestCases(relativePath) {
  const text = readText(relativePath);
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const cases = [];
  let current = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const description = line.match(/^- description:\s*(.*)$/);
    if (description) {
      if (current) cases.push(current);
      current = {
        description: description[1].trim() || `line ${index + 1}`,
        lines: [line],
        line: index + 1,
      };
      continue;
    }
    if (current) current.lines.push(line);
  }

  if (current) cases.push(current);
  return cases.map((testCase) => ({
    description: testCase.description,
    line: testCase.line,
    text: testCase.lines.join("\n"),
  }));
}

function caseLabel(testCase) {
  return `case "${testCase.description}" at line ${testCase.line}`;
}

function caseContains(relativePath, testCase, needle, description) {
  if (!testCase.text.includes(needle)) {
    failures.push(`${relativePath} ${caseLabel(testCase)} must ${description}`);
  }
}

function caseNotContains(relativePath, testCase, needle, description) {
  if (testCase.text.includes(needle)) {
    failures.push(`${relativePath} ${caseLabel(testCase)} must not ${description}`);
  }
}

function caseMatches(relativePath, testCase, pattern, description) {
  if (!pattern.test(testCase.text)) {
    failures.push(`${relativePath} ${caseLabel(testCase)} must ${description}`);
  }
}

function caseSectionMatches(relativePath, testCase, sectionName, pattern, description) {
  if (!pattern.test(sectionText(testCase.text, sectionName))) {
    failures.push(`${relativePath} ${caseLabel(testCase)} must ${description}`);
  }
}

function caseSectionNotContains(relativePath, testCase, sectionName, needle, description) {
  if (sectionContains(testCase.text, sectionName, needle)) {
    failures.push(`${relativePath} ${caseLabel(testCase)} must not ${description}`);
  }
}

function sectionContains(text, sectionName, needle) {
  return sectionText(text, sectionName).includes(needle);
}

function sectionText(text, sectionName) {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  let sectionIndent = 0;
  const sectionLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inSection) {
      const match = line.match(/^(\s*)([^:#]+):\s*$/);
      if (match && match[2] === sectionName) {
        inSection = true;
        sectionIndent = match[1].length;
      }
      continue;
    }

    const indent = line.match(/^(\s*)/)[1].length;
    if (trimmed !== "" && indent <= sectionIndent) {
      break;
    }
    sectionLines.push(line);
  }

  return sectionLines.join("\n");
}

function executable(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return;
  if ((fs.statSync(absolutePath).mode & 0o111) === 0) {
    failures.push(`${relativePath} must be executable`);
  }
}

function jsonDevDependency(name) {
  const text = readText("package.json");
  if (!text) return;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    failures.push(`package.json is invalid JSON: ${error.message}`);
    return;
  }
  if (!parsed.devDependencies?.[name]) {
    failures.push(`package.json must declare devDependency ${name}`);
  }
}

jsonDevDependency("promptfoo");
jsonDevDependency("agent-skill-evals");

contains("agent-skill-evals/agent.js", 'export { default } from "agent-skill-evals/agent";');
contains("agent-skill-evals/skill-checks.js", 'export { default } from "agent-skill-evals/skill-checks";');
contains("agent-skill-evals/assertions.js", 'export { default } from "agent-skill-evals/assertions";');
contains("agent-skill-evals/assertions.js", 'export * from "agent-skill-evals/assertions";');

contains(`${skillPath}/SKILL.md`, `name: ${skillSlug}`);

contains("promptfoo.skill-checks.yaml", "prompts:");
contains("promptfoo.skill-checks.yaml", "file://./agent-skill-evals/skill-checks.js");
contains("promptfoo.skill-checks.yaml", `skillPath: ./${skillPath}`);
contains("promptfoo.skill-checks.yaml", `testsGlob: ./${testsPath}`);
contains("promptfoo.skill-checks.yaml", "metric: skill.checks");

if (flag(args.requireBudgetsCheck)) {
  contains("promptfoo.skill-checks.yaml", "metric: skill.budgets");
  matches(
    "promptfoo.skill-checks.yaml",
    /metric:\s*skill\.budgets[\s\S]*config:[\s\S]*agentSkillEvals:[\s\S]*requireTokenBudget:\s*true/,
    "configure skill.budgets with config.agentSkillEvals.requireTokenBudget: true",
  );
}

contains(agentConfig, "prompts:");
contains(agentConfig, "file://./agent-skill-evals/agent.js");
contains(agentConfig, "adapter: codex-json");
contains(agentConfig, "command: codex");
matches(
  agentConfig,
  codexArgsPattern,
  "put Codex global flags before exec and use '-' as the prompt argument",
);
notContains(agentConfig, "stdin:");
contains(agentConfig, "{{prompt}}");
contains(agentConfig, `file://${testsPath}`);
matches(
  agentConfig,
  new RegExp(`tests:\\s*\\n\\s*-\\s*file://${escapeRegex(testsPath)}`),
  `list tests as file://${testsPath}`,
);
if (flag(args.requireMcp)) {
  contains(agentConfig, "mcp_servers.");
}

const runtimeTests = runtimeTestCases(testsPath);
let hasPositiveCase = false;
let hasNegativeCase = false;
let hasClarificationCase = false;

for (const testCase of runtimeTests) {
  caseContains(testsPath, testCase, `skill: ${skillSlug}`, `declare skill: ${skillSlug}`);
  caseNotContains(testsPath, testCase, `name: ${skillSlug}`, `use skill: ${skillSlug} instead of name: ${skillSlug}`);
  caseContains(testsPath, testCase, `fixture: ./${fixturePath}`, `declare fixture: ./${fixturePath}`);
  caseMatches(
    testsPath,
    testCase,
    /\bkind:\s*(positive|negative|clarification)\b/,
    "declare kind: positive, negative, or clarification",
  );
  hasPositiveCase ||= /\bkind:\s*positive\b/.test(testCase.text);
  hasNegativeCase ||= /\bkind:\s*negative\b/.test(testCase.text);
  hasClarificationCase ||= /\bkind:\s*clarification\b/.test(testCase.text);
  caseSectionMatches(
    testsPath,
    testCase,
    "preconditions",
    /verifier\.fails:[\s\S]*run:\s*\.\/[A-Za-z0-9_.-]+/,
    "declare verifier.fails with a local run path",
  );
  caseSectionNotContains(testsPath, testCase, "preconditions", "file.created", "use file.created as a precondition");
  caseSectionMatches(
    testsPath,
    testCase,
    "should",
    /verifier\.succeeds:[\s\S]*run:\s*\.\/[A-Za-z0-9_.-]+/,
    "declare verifier.succeeds with a local run path",
  );
  if (testCase.text.includes("skill.loaded:")) {
    caseMatches(
      testsPath,
      testCase,
      skillLoadedIncludesPattern,
      `use should_include when it checks skill.loaded for ${skillSlug}`,
    );
  }
  if (flag(args.requireSkillLoaded)) {
    caseContains(testsPath, testCase, "skill.loaded:", "declare skill.loaded");
    caseMatches(
      testsPath,
      testCase,
      skillLoadedIncludesPattern,
      `check loaded skill evidence for ${skillSlug}`,
    );
  }
  if (args.skillLoadedDelivery && (flag(args.requireSkillLoaded) || testCase.text.includes("skill.loaded:"))) {
    caseMatches(
      testsPath,
      testCase,
      new RegExp(`skill\\.loaded:[\\s\\S]*delivery:\\s*${escapeRegex(args.skillLoadedDelivery)}`),
      `set skill.loaded delivery to ${args.skillLoadedDelivery}`,
    );
  }
  caseMatches(
    testsPath,
    testCase,
    skillTestAssertionPattern,
    "declare the skill.test JavaScript assertion",
  );
}

if (!hasPositiveCase) {
  failures.push(`${testsPath} must contain kind: positive`);
}
if (!hasNegativeCase) {
  failures.push(`${testsPath} must contain kind: negative`);
}
for (const tool of requiredToolCalls) {
  contains(testsPath, "tool.called:");
  contains(testsPath, `tool: ${tool}`);
  notContains(testsPath, `name: ${tool}`);
}
for (const tool of forbiddenToolCalls) {
  contains(testsPath, "tool.not_called:");
  contains(testsPath, `tool: ${tool}`);
  notContains(testsPath, `name: ${tool}`);
}
matches(testsPath, /file\.changes_outside_scope:[\s\S]*scope:/, "use file.changes_outside_scope with scope");
matches(
  testsPath,
  skillTestAssertionPattern,
  "declare the skill.test JavaScript assertion",
);
const runtimeTestCount = runtimeTests.length;
if (runtimeTestCount < 2) {
  failures.push(`${testsPath} must contain at least 2 test cases, found ${runtimeTestCount}`);
}
count(testsPath, "metric: skill.test", runtimeTestCount * 2);
if (flag(args.requireBudget)) {
  countAtLeast(testsPath, "metric: skill.budget", runtimeTestCount * 2);
  contains(testsPath, "maxTotalTokens");
  contains(testsPath, "maxCompletionTokens");
}
if (flag(args.requireLlmRubric)) {
  matches(
    testsPath,
    /type:\s*llm-rubric[\s\S]*value:/,
    "declare a native Promptfoo llm-rubric assertion with a value",
  );
}
if (flag(args.requireClarificationCase)) {
  if (!hasClarificationCase) {
    failures.push(`${testsPath} must contain kind: clarification`);
  }
  contains(testsPath, "tool.not_called:");
}
notContains(testsPath, "cwd:");
notContains(testsPath, "allowed:");

const verifierPath = `${fixturePath}/${verifier}`;
contains(verifierPath, outputs[0] ?? "");
executable(verifierPath);
for (const output of outputs) {
  matches(testsPath, new RegExp(`path:\\s*${escapeRegex(output)}`), `check ${output} relative to the copied fixture root`);
  notContains(testsPath, `${fixturePath}/${output}`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Agent Skill Evals setup is valid for ${skillSlug}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "true";
    if (parsed[key] === undefined) parsed[key] = value;
    else if (Array.isArray(parsed[key])) parsed[key].push(value);
    else parsed[key] = [parsed[key], value];
  }
  return parsed;
}

function required(value, message) {
  if (typeof value !== "string" || value.trim() === "") {
    console.error(message);
    process.exit(2);
  }
  return value;
}

function listArg(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function flag(value) {
  return value === true || value === "true";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
