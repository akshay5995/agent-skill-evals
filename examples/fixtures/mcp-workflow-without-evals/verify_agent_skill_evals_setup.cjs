#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const failures = [];
const ignoredDirs = new Set(["node_modules", ".git", ".agents"]);

function readText(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath} is missing`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function assertContains(relativePath, needle) {
  const text = readText(relativePath);
  if (text && !text.includes(needle)) {
    failures.push(`${relativePath} must contain ${JSON.stringify(needle)}`);
  }
}

function assertNotContains(relativePath, needle) {
  const text = readText(relativePath);
  if (text && text.includes(needle)) {
    failures.push(`${relativePath} must not contain ${JSON.stringify(needle)}`);
  }
}

function assertMatches(relativePath, pattern, description) {
  const text = readText(relativePath);
  if (text && !pattern.test(text)) {
    failures.push(`${relativePath} must ${description}`);
  }
}

function assertCountAtLeast(relativePath, needle, expected) {
  const text = readText(relativePath);
  if (!text) return;
  const actual = text.split(needle).length - 1;
  if (actual < expected) {
    failures.push(`${relativePath} must contain ${JSON.stringify(needle)} at least ${expected} time(s), found ${actual}`);
  }
}

function assertExecutable(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return;
  if ((fs.statSync(absolutePath).mode & 0o111) === 0) {
    failures.push(`${relativePath} must be executable`);
  }
}

function assertJsonDevDependency(name) {
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

assertJsonDevDependency("promptfoo");
assertJsonDevDependency("agent-skill-evals");

assertContains("agent-skill-evals/agent.js", 'export { default } from "agent-skill-evals/agent";');
assertContains("agent-skill-evals/skill-checks.js", 'export { default } from "agent-skill-evals/skill-checks";');
assertContains("agent-skill-evals/assertions.js", 'export { default } from "agent-skill-evals/assertions";');
assertContains("agent-skill-evals/assertions.js", 'export * from "agent-skill-evals/assertions";');

assertContains("promptfoo.skill-checks.yaml", "file://./agent-skill-evals/skill-checks.js");
assertContains("promptfoo.skill-checks.yaml", "skillPath: ./skills/incident-triage");
assertContains("promptfoo.skill-checks.yaml", "testsGlob: ./tests/incident-triage.yaml");
assertContains("promptfoo.skill-checks.yaml", "metric: skill.checks");
assertContains("promptfoo.skill-checks.yaml", "metric: skill.budgets");
assertMatches(
  "promptfoo.skill-checks.yaml",
  /metric:\s*skill\.budgets[\s\S]*config:[\s\S]*agentSkillEvals:[\s\S]*requireTokenBudget:\s*true/,
  "configure skill.budgets with config.agentSkillEvals.requireTokenBudget: true",
);

assertContains("promptfoo.mcp.codex.yaml", "file://./agent-skill-evals/agent.js");
assertContains("promptfoo.mcp.codex.yaml", "adapter: codex-json");
assertContains("promptfoo.mcp.codex.yaml", "command: codex");
assertContains("promptfoo.mcp.codex.yaml", "mcp_servers.incident_ops.url");
assertContains("promptfoo.mcp.codex.yaml", "${INCIDENT_OPS_MCP_URL}");
assertMatches(
  "promptfoo.mcp.codex.yaml",
  /args:[\s\S]*-\s+--ask-for-approval[\s\S]*-\s+never[\s\S]*-\s+--sandbox[\s\S]*-\s+workspace-write[\s\S]*-\s+exec[\s\S]*-\s+--json[\s\S]*-\s+"-"/,
  "put Codex global flags before exec and use '-' as the prompt argument",
);
assertContains("promptfoo.mcp.codex.yaml", "file://tests/incident-triage.yaml");
assertNotContains("promptfoo.mcp.codex.yaml", "stdin:");

assertContains("tests/incident-triage.yaml", "skill: incident-triage");
assertNotContains("tests/incident-triage.yaml", "name: incident-triage");
assertContains("tests/incident-triage.yaml", "kind: positive");
assertContains("tests/incident-triage.yaml", "kind: negative");
assertContains("tests/incident-triage.yaml", "kind: clarification");
assertContains("tests/incident-triage.yaml", "fixture: ./fixtures/incident-triage");
assertContains("tests/incident-triage.yaml", "skill.loaded:");
assertContains("tests/incident-triage.yaml", "delivery: mcp");
assertMatches(
  "tests/incident-triage.yaml",
  /skill\.loaded:[\s\S]*should_include:[\s\S]*-\s*incident-triage/,
  "check MCP loaded-skill evidence for incident-triage",
);
assertContains("tests/incident-triage.yaml", "tool.called:");
assertContains("tests/incident-triage.yaml", "tool: mcp__incident_ops__get_service_status");
assertContains("tests/incident-triage.yaml", "tool: mcp__incident_ops__search_recent_errors");
assertContains("tests/incident-triage.yaml", "tool.not_called:");
assertContains("tests/incident-triage.yaml", "tool: mcp__incident_ops__restart_service");
assertNotContains("tests/incident-triage.yaml", "name: mcp__incident_ops__get_service_status");
assertNotContains("tests/incident-triage.yaml", "name: mcp__incident_ops__search_recent_errors");
assertNotContains("tests/incident-triage.yaml", "name: mcp__incident_ops__restart_service");
assertContains("tests/incident-triage.yaml", "server: incident_ops");
assertContains("tests/incident-triage.yaml", "args_match:");
assertContains("tests/incident-triage.yaml", "service");
assertContains("tests/incident-triage.yaml", "payments-api");
assertContains("tests/incident-triage.yaml", "environment");
assertContains("tests/incident-triage.yaml", "prod");
assertContains("tests/incident-triage.yaml", "verifier.fails");
assertContains("tests/incident-triage.yaml", "verifier.succeeds");
assertContains("tests/incident-triage.yaml", "file.created:");
assertContains("tests/incident-triage.yaml", "path: incident-summary.md");
assertContains("tests/incident-triage.yaml", "file.changes_outside_scope:");
assertContains("tests/incident-triage.yaml", "scope:");
assertContains("tests/incident-triage.yaml", "metric: skill.test");
assertContains("tests/incident-triage.yaml", "metric: skill.budget");
assertContains("tests/incident-triage.yaml", "type: llm-rubric");
assertContains("tests/incident-triage.yaml", "metric: clarification.quality");
assertContains("tests/incident-triage.yaml", "clarifying");
assertContains("tests/incident-triage.yaml", "service");
assertContains("tests/incident-triage.yaml", "environment");
assertContains("tests/incident-triage.yaml", "maxTotalTokens");
assertContains("tests/incident-triage.yaml", "maxCompletionTokens");
assertCountAtLeast("tests/incident-triage.yaml", "metric: skill.test", 2);
assertCountAtLeast("tests/incident-triage.yaml", "metric: skill.budget", 2);

assertContains("fixtures/incident-triage/verify_incident_triage.cjs", "incident-summary.md");
assertContains("fixtures/incident-triage/verify_incident_triage.cjs", "request.json");
assertExecutable("fixtures/incident-triage/verify_incident_triage.cjs");

const allowed = new Set([
  "package.json",
  "skills/incident-triage/SKILL.md",
  "fixtures/incident-triage/request.json",
  "fixtures/incident-triage/verify_incident_triage.cjs",
  "mcp/incident-ops.mcp.json",
  "verify_agent_skill_evals_setup.cjs",
  "skills-lock.json",
  "agent-skill-evals/agent.js",
  "agent-skill-evals/skill-checks.js",
  "agent-skill-evals/assertions.js",
  "promptfoo.skill-checks.yaml",
  "promptfoo.mcp.codex.yaml",
  "tests/incident-triage.yaml",
]);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath);
    } else if (entry.isFile()) {
      const relativePath = path.relative(root, absolutePath);
      if (!allowed.has(relativePath)) {
        failures.push(`unexpected file created: ${relativePath}`);
      }
    }
  }
}

walk(root);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Agent Skill Evals MCP workflow setup is present for incident-triage");
