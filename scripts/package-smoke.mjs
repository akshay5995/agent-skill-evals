import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "..");
const packagesDir = join(repoRoot, "packages");
const publishablePackages = [
  "agent-skill-evals",
];

const tempRoot = await mkdtemp(join(tmpdir(), "agent-skill-evals-package-smoke-"));
const tarballDir = join(tempRoot, "tarballs");
const consumerDir = join(tempRoot, "consumer");
const pnpmCommand = process.env.npm_execpath ? process.execPath : "pnpm";
const pnpmArgsPrefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];
const commandTimeoutMs = Number(process.env.AGENT_SKILL_EVALS_PACK_SMOKE_TIMEOUT_MS ?? 120_000);

try {
  await run("mkdir", ["-p", tarballDir, consumerDir], repoRoot);

  for (const name of publishablePackages) {
    const packageDir = await packageDirFor(name);
    await runPnpm(["pack", "--pack-destination", tarballDir], packageDir);
  }

  const tarballs = await runCapture("find", [tarballDir, "-name", "*.tgz"], repoRoot);
  const tarballPaths = tarballs.split("\n").map((line) => line.trim()).filter(Boolean);
  if (tarballPaths.length !== publishablePackages.length) {
    throw new Error(`expected ${publishablePackages.length} tarballs, found ${tarballPaths.length}`);
  }

  const overrides = Object.fromEntries(
    publishablePackages.map((name) => [name, `file:${tarballFor(name, tarballPaths)}`]),
  );

  await writeFile(join(consumerDir, "package.json"), JSON.stringify({
    name: "agent-skill-evals-release-consumer-smoke",
    type: "module",
    private: true,
    pnpm: {
      overrides,
      onlyBuiltDependencies: [
        "better-sqlite3",
      ],
    },
  }, null, 2));

  await runPnpm(["add", "promptfoo@^0.121.11", "adm-zip@^0.5.17", "pptxgenjs@^4.0.1", ...tarballPaths], consumerDir);

  const importLines = [
    `await import("agent-skill-evals/agent");`,
    `await import("agent-skill-evals/skill-checks");`,
    `await import("agent-skill-evals/assertions");`,
    `await import("agent-skill-evals").then(() => { throw new Error("root export unexpectedly resolved"); }, (err) => { if (err.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw err; });`,
  ].join("\n");
  await writeFile(join(consumerDir, "smoke.mjs"), `${importLines}\nconsole.log("pack smoke imports passed");\n`);
  await run("node", ["smoke.mjs"], consumerDir);

  await writeConsumerSkillProject(consumerDir);
  await runPromptfoo(["eval", "-c", "promptfoo.skill-checks.yaml", "--no-cache", "--no-write"], consumerDir);
  await runPromptfoo(["eval", "-c", "promptfoo.skill-tests.yaml", "--no-cache", "--no-write"], consumerDir);
} finally {
  if (process.env.AGENT_SKILL_EVALS_KEEP_PACK_SMOKE !== "1") {
    await rm(tempRoot, { recursive: true, force: true });
  } else {
    console.log(`kept pack smoke workspace: ${tempRoot}`);
  }
}

async function packageDirFor(name) {
  const dirs = await runCapture("find", [packagesDir, "-mindepth", "2", "-maxdepth", "2", "-name", "package.json"], repoRoot);
  for (const packageJsonPath of dirs.split("\n").map((line) => line.trim()).filter(Boolean)) {
    const pkg = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (pkg.name === name) {
      return packageJsonPath.slice(0, -"package.json".length - 1);
    }
  }
  throw new Error(`package not found: ${name}`);
}

function tarballFor(name, tarballPaths) {
  const stem = `${name.replace(/^@/, "").replace("/", "-")}-`;
  const tarballPath = tarballPaths.find((path) => basename(path).startsWith(stem));
  if (!tarballPath) {
    throw new Error(`tarball not found for ${name}`);
  }
  return tarballPath;
}

function runPnpm(args, cwd, env = {}) {
  return run(pnpmCommand, [...pnpmArgsPrefix, ...args], cwd, env);
}

function runPromptfoo(args, cwd) {
  return runPnpm(["exec", "promptfoo", ...args], cwd, {
    // Verifier scripts run inside copied fixture worlds; let them resolve the
    // consumer project's installed verifier dependencies.
    NODE_PATH: join(cwd, "node_modules"),
    PROMPTFOO_DISABLE_TELEMETRY: "1",
  });
}

async function writeConsumerSkillProject(root) {
  await mkdir(join(root, "agent-skill-evals"), { recursive: true });
  await writeFile(join(root, "agent-skill-evals", "agent.js"), `export { default } from "agent-skill-evals/agent";\n`);
  await writeFile(join(root, "agent-skill-evals", "skill-checks.js"), `export { default } from "agent-skill-evals/skill-checks";\n`);
  await writeFile(
    join(root, "agent-skill-evals", "assertions.js"),
    `export { default } from "agent-skill-evals/assertions";\nexport * from "agent-skill-evals/assertions";\n`,
  );

  await mkdir(join(root, "skills"), { recursive: true });
  await mkdir(join(root, "tests"), { recursive: true });
  await mkdir(join(root, "fixtures"), { recursive: true });
  await mkdir(join(root, "agents"), { recursive: true });

  await cp(join(repoRoot, "examples", "skills", "brand-deck"), join(root, "skills", "brand-deck"), {
    recursive: true,
  });
  await cp(join(repoRoot, "examples", "skills", "bugfix-workflow"), join(root, "skills", "bugfix-workflow"), {
    recursive: true,
  });
  await cp(join(repoRoot, "examples", "tests", "brand-deck.yaml"), join(root, "tests", "brand-deck.yaml"));
  await cp(join(repoRoot, "examples", "tests", "bugfix-workflow.yaml"), join(root, "tests", "bugfix-workflow.yaml"));
  await cp(join(repoRoot, "examples", "fixtures", "brand-deck"), join(root, "fixtures", "brand-deck"), {
    recursive: true,
  });
  await cp(join(repoRoot, "examples", "fixtures", "login-bug"), join(root, "fixtures", "login-bug"), {
    recursive: true,
  });
  await writeFile(join(root, "agents", "package-smoke-agent.mjs"), packageSmokeAgentSource());

  await writeFile(join(root, "promptfoo.skill-checks.yaml"), `description: Agent Skill Evals packed-package consumer skill checks

prompts:
  - "static-check"

providers:
  - id: file://./agent-skill-evals/skill-checks.js
    label: agent-skill-evals-skill-checks

defaultTest:
  options:
    runSerially: true

tests:
  - description: brand-deck static checks
    vars:
      skillPath: ./skills/brand-deck
      testsGlob: ./tests/brand-deck.yaml
    assert:
      - type: javascript
        metric: skill.checks
        value: file://./agent-skill-evals/assertions.js
        config:
          metric: skill.checks

  - description: bugfix-workflow static checks
    vars:
      skillPath: ./skills/bugfix-workflow
      testsGlob: ./tests/bugfix-workflow.yaml
    assert:
      - type: javascript
        metric: skill.checks
        value: file://./agent-skill-evals/assertions.js
        config:
          metric: skill.checks
`);

  await writeFile(join(root, "promptfoo.skill-tests.yaml"), `description: Agent Skill Evals packed-package consumer runtime smoke

prompts:
  - "{{prompt}}"

providers:
  - id: file://./agent-skill-evals/agent.js
    label: package-smoke-agent
    config:
      adapter: internal-test-json
      command: node
      args:
        - ./agents/package-smoke-agent.mjs
      timeoutMs: 30000

defaultTest:
  options:
    runSerially: true

tests:
  - file://tests/brand-deck.yaml
  - file://tests/bugfix-workflow.yaml
`);
}

function packageSmokeAgentSource() {
  return String.raw`#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import pptxgen from "pptxgenjs";

let prompt = "";

function emit(message) {
  console.log(JSON.stringify({ type: "agent_message", message }));
}

function emitToolCall(tool, input) {
  console.log(JSON.stringify({ type: "tool_call", tool, input }));
}

function fixLoginRedirect() {
  if (!existsSync("app.js")) {
    emit("package-smoke-agent: app.js not found.");
    return;
  }
  const before = readFileSync("app.js", "utf8");
  const after = before.replaceAll('"/wrong-path"', '"/dashboard"');
  emitToolCall("Edit", { path: "app.js" });
  writeFileSync("app.js", after);
  emit("package-smoke-agent: patched login redirect.");
}

function deckSource() {
  return [
    'const pptxgen = require("pptxgenjs");',
    'const pptx = new pptxgen();',
    'const brand = { primaryBlue: "1B4D89", accentGold: "F2C94C", ink: "0B1F33" };',
    'pptx.writeFile({ fileName: "launch-deck.pptx" });',
  ].join("\n");
}

async function createBrandDeck() {
  if (!existsSync("brief.md") || !existsSync("brand-guidelines.md")) {
    emit("package-smoke-agent: brand inputs not found.");
    return;
  }

  writeFileSync("deck.js", deckSource());
  emitToolCall("Write", { path: "deck.js" });

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  const brand = {
    primaryBlue: "1B4D89",
    accentGold: "F2C94C",
    ink: "0B1F33",
    softBackground: "F6F8FB",
  };
  const addTitle = (slide, title) => {
    slide.background = { color: brand.softBackground };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.18, fill: { color: brand.accentGold }, line: { color: brand.accentGold } });
    slide.addText(title, { x: 0.65, y: 0.55, w: 11.7, h: 0.55, fontSize: 28, bold: true, color: brand.primaryBlue, margin: 0 });
  };
  const addBody = (slide, lines) => {
    slide.addText(lines.join("\n"), { x: 0.75, y: 1.55, w: 11.7, h: 3.65, fontSize: 20, fit: "shrink", color: brand.ink, valign: "mid", bullet: { type: "ul" } });
  };

  let slide = pptx.addSlide();
  slide.background = { color: brand.primaryBlue };
  slide.addText("Nimbus Analytics", { x: 0.75, y: 2.0, w: 11.7, h: 0.75, fontSize: 36, bold: true, color: "FFFFFF", margin: 0 });
  slide.addText("Expansion risk, visible before renewal pressure hits.", { x: 0.78, y: 2.9, w: 9.6, h: 0.45, fontSize: 18, color: "FFFFFF", margin: 0 });
  slide.addShape(pptx.ShapeType.rect, { x: 0.75, y: 4.25, w: 2.5, h: 0.18, fill: { color: brand.accentGold }, line: { color: brand.accentGold } });

  slide = pptx.addSlide();
  addTitle(slide, "Churn signals arrive too late");
  addBody(slide, ["Account notes are scattered across tools.", "Support sentiment shows up after risk is already visible."]);

  slide = pptx.addSlide();
  addTitle(slide, "From scattered notes to renewal focus");
  addBody(slide, ["Nimbus combines product usage, support sentiment, and CRM context.", "Teams see which accounts need action this week."]);

  slide = pptx.addSlide();
  addTitle(slide, "Trusted rollout, measurable lift");
  addBody(slide, ["Pilot with two renewal cycles.", "Track churn risk reduction and expansion readiness."]);

  slide = pptx.addSlide();
  addTitle(slide, "Book the pilot");
  addBody(slide, ["Choose 20 renewal accounts.", "Connect product, support, and CRM signals.", "Book the pilot."]);

  await pptx.writeFile({ fileName: "launch-deck.pptx" });
  emitToolCall("Write", { path: "launch-deck.pptx" });
  emit("package-smoke-agent: created launch deck.");
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  prompt += chunk;
});
process.stdin.on("end", async () => {
  const wantsDeck = /deck|slides|presentation|powerpoint|ppt/i.test(prompt) && /nimbus|spring|launch|review/i.test(prompt);
  if (wantsDeck) {
    await createBrandDeck();
    return;
  }
  const wantsFix = /\b(fix|repair|correct|patch)\b/i.test(prompt) && /redirect|login/i.test(prompt);
  if (wantsFix) {
    fixLoginRedirect();
    return;
  }
  emit("package-smoke-agent: nothing to do.");
});
`;
}

function run(command, args, cwd, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "inherit", "inherit"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} ${args.join(" ")} timed out after ${commandTimeoutMs}ms`));
    }, commandTimeoutMs);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}`));
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function runCapture(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "inherit"] });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} ${args.join(" ")} timed out after ${commandTimeoutMs}ms`));
    }, commandTimeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}`));
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
