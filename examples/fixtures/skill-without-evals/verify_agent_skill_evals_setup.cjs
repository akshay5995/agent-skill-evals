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

function assertCount(relativePath, needle, expected) {
  const text = readText(relativePath);
  if (!text) return;
  const actual = text.split(needle).length - 1;
  if (actual !== expected) {
    failures.push(`${relativePath} must contain ${JSON.stringify(needle)} ${expected} time(s), found ${actual}`);
  }
}

function matchCount(relativePath, pattern) {
  const text = readText(relativePath);
  if (!text) return 0;
  return (text.match(pattern) ?? []).length;
}

function assertSectionNotContains(relativePath, sectionName, needle, description) {
  const text = readText(relativePath);
  if (!text) return;
  const lines = text.split(/\r?\n/);
  let inSection = false;
  let sectionIndent = 0;

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
      inSection = false;
      continue;
    }

    if (line.includes(needle)) {
      failures.push(`${relativePath} must not ${description}`);
      return;
    }
  }
}

function assertMatchIfContains(relativePath, needle, pattern, description) {
  const text = readText(relativePath);
  if (!text || !text.includes(needle)) return;
  if (!pattern.test(text)) {
    failures.push(`${relativePath} must ${description}`);
  }
}

function assertExecutable(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return;
  const mode = fs.statSync(absolutePath).mode;
  if ((mode & 0o111) === 0) {
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

assertContains(
  "agent-skill-evals/agent.js",
  'export { default } from "agent-skill-evals/agent";',
);
assertContains(
  "agent-skill-evals/skill-checks.js",
  'export { default } from "agent-skill-evals/skill-checks";',
);
assertContains(
  "agent-skill-evals/assertions.js",
  'export { default } from "agent-skill-evals/assertions";',
);
assertContains(
  "agent-skill-evals/assertions.js",
  'export * from "agent-skill-evals/assertions";',
);

assertContains("promptfoo.skill-checks.yaml", "file://./agent-skill-evals/skill-checks.js");
assertContains("promptfoo.skill-checks.yaml", "prompts:");
assertContains("promptfoo.skill-checks.yaml", "skillPath: ./skills/release-notes");
assertContains("promptfoo.skill-checks.yaml", "testsGlob: ./tests/release-notes.yaml");
assertContains("promptfoo.skill-checks.yaml", "metric: skill.checks");

assertContains("promptfoo.codex.yaml", "file://./agent-skill-evals/agent.js");
assertContains("promptfoo.codex.yaml", "adapter: codex-json");
assertContains("promptfoo.codex.yaml", "command: codex");
assertContains("promptfoo.codex.yaml", "--ask-for-approval");
assertContains("promptfoo.codex.yaml", "never");
assertContains("promptfoo.codex.yaml", "--sandbox");
assertContains("promptfoo.codex.yaml", "workspace-write");
assertContains("promptfoo.codex.yaml", "--json");
assertContains("promptfoo.codex.yaml", "--skip-git-repo-check");
assertContains("promptfoo.codex.yaml", "--ephemeral");
assertContains("promptfoo.codex.yaml", "--ignore-user-config");
assertContains("promptfoo.codex.yaml", "--ignore-rules");
assertMatches("promptfoo.codex.yaml", /\n\s*-\s+"-"\s*(\n|$)/, "pass the prompt through the '-' argument");
assertMatches(
  "promptfoo.codex.yaml",
  /args:[\s\S]*-\s+--ask-for-approval[\s\S]*-\s+never[\s\S]*-\s+--sandbox[\s\S]*-\s+workspace-write[\s\S]*-\s+exec[\s\S]*-\s+--json[\s\S]*-\s+"-"/,
  "put Codex global flags before exec and use '-' as the prompt argument",
);
assertNotContains("promptfoo.codex.yaml", "stdin:");
assertContains("promptfoo.codex.yaml", "{{prompt}}");
assertContains("promptfoo.codex.yaml", "file://tests/release-notes.yaml");
assertMatches(
  "promptfoo.codex.yaml",
  /tests:\s*\n\s*-\s*file:\/\/tests\/release-notes\.yaml/,
  "list tests as file://tests/release-notes.yaml",
);

assertContains("tests/release-notes.yaml", "release-notes");
assertContains("tests/release-notes.yaml", "skill: release-notes");
assertNotContains("tests/release-notes.yaml", "name: release-notes");
assertContains("tests/release-notes.yaml", "kind: positive");
assertContains("tests/release-notes.yaml", "kind: negative");
assertContains("tests/release-notes.yaml", "fixture: ./fixtures/release-notes");
assertContains("tests/release-notes.yaml", "preconditions:");
assertMatches(
  "tests/release-notes.yaml",
  /preconditions:[\s\S]*verifier\.fails:[\s\S]*run:\s*\.\/verify_release_notes\.cjs/,
  "declare verifier.fails with run: ./verify_release_notes.cjs",
);
assertSectionNotContains(
  "tests/release-notes.yaml",
  "preconditions",
  "file.created",
  "use file.created as a precondition",
);
assertContains("tests/release-notes.yaml", "should:");
assertMatches(
  "tests/release-notes.yaml",
  /should:[\s\S]*verifier\.succeeds:[\s\S]*run:\s*\.\/verify_release_notes\.cjs/,
  "declare verifier.succeeds with run: ./verify_release_notes.cjs",
);
assertMatchIfContains(
  "tests/release-notes.yaml",
  "skill.loaded:",
  /skill\.loaded:[\s\S]*should_include:[\s\S]*-\s*release-notes/,
  "use should_include when it checks skill.loaded",
);
assertContains("tests/release-notes.yaml", "should_not:");
assertMatches(
  "tests/release-notes.yaml",
  /file\.created:[\s\S]*path:\s*CHANGELOG\.md/,
  "check CHANGELOG.md relative to the copied fixture root",
);
assertMatches(
  "tests/release-notes.yaml",
  /file\.changes_outside_scope:[\s\S]*scope:[\s\S]*-\s*CHANGELOG\.md/,
  "use file.changes_outside_scope with scope: [CHANGELOG.md]",
);
assertMatches(
  "tests/release-notes.yaml",
  /assert:[\s\S]*type:\s*javascript[\s\S]*metric:\s*skill\.test[\s\S]*value:\s*file:\/\/\.\/agent-skill-evals\/assertions\.js[\s\S]*config:[\s\S]*metric:\s*skill\.test/,
  "declare the skill.test JavaScript assertion",
);
const runtimeTestCount = matchCount("tests/release-notes.yaml", /^- description:/gm);
if (runtimeTestCount < 2) {
  failures.push(`tests/release-notes.yaml must contain at least 2 test cases, found ${runtimeTestCount}`);
}
assertCount("tests/release-notes.yaml", "metric: skill.test", runtimeTestCount * 2);
assertContains("tests/release-notes.yaml", "verifier.fails");
assertContains("tests/release-notes.yaml", "verifier.succeeds");
assertContains("tests/release-notes.yaml", "file.created");
assertContains("tests/release-notes.yaml", "file.changes_outside_scope");
assertNotContains("tests/release-notes.yaml", "type: file.created");
assertNotContains("tests/release-notes.yaml", "config:\n          verifier.succeeds");
assertNotContains("tests/release-notes.yaml", "cwd:");
assertNotContains("tests/release-notes.yaml", "allowed:");
assertNotContains("tests/release-notes.yaml", "./fixtures/release-notes/CHANGELOG.md");

assertContains("fixtures/release-notes/verify_release_notes.cjs", "CHANGELOG.md");
assertContains("fixtures/release-notes/verify_release_notes.cjs", "changes.json");
assertExecutable("fixtures/release-notes/verify_release_notes.cjs");

const targetSkill = readText("skills/release-notes/SKILL.md");
if (targetSkill && !targetSkill.includes("name: release-notes")) {
  failures.push("skills/release-notes/SKILL.md must remain the release-notes skill");
}

const allowed = new Set([
  "package.json",
  "skills/release-notes/SKILL.md",
  "fixtures/release-notes/changes.json",
  "fixtures/release-notes/verify_release_notes.cjs",
  "verify_agent_skill_evals_setup.cjs",
  "skills-lock.json",
  "agent-skill-evals/agent.js",
  "agent-skill-evals/skill-checks.js",
  "agent-skill-evals/assertions.js",
  "promptfoo.skill-checks.yaml",
  "promptfoo.codex.yaml",
  "tests/release-notes.yaml",
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

console.log("Agent Skill Evals setup is present for release-notes");
