import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const packageDir = join(repoRoot, "packages", "promptfoo");
const root = await mkdtemp(join(tmpdir(), "agent-skill-evals-package-smoke-"));
const tarballs = join(root, "tarballs");
const consumer = join(root, "consumer");
const pnpm = process.env.npm_execpath ? process.execPath : "pnpm";
const prefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];

try {
  await mkdir(tarballs, { recursive: true });
  await mkdir(consumer, { recursive: true });
  await runPnpm(["pack", "--pack-destination", tarballs], packageDir);
  const entries = await runCapture("find", [tarballs, "-name", "*.tgz"], repoRoot);
  const tarball = entries.trim().split("\n").find((path) => basename(path).startsWith("agent-skill-evals-"));
  if (!tarball) throw new Error("packed agent-skill-evals tarball not found");

  await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "packed-consumer", private: true, type: "module" }, null, 2));
  await runPnpm(["add", "--ignore-scripts", "promptfoo@^0.121.13", tarball], consumer);
  await writeFile(join(consumer, "imports.mjs"), [
    'await import("agent-skill-evals/agent");',
    'await import("agent-skill-evals/assertions");',
    'await import("agent-skill-evals/test-generator");',
    'await import("agent-skill-evals").then(() => { throw new Error("root export resolved"); }, e => { if (e.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw e; });',
  ].join("\n"));
  await run("node", ["imports.mjs"], consumer);

  await mkdir(join(consumer, "skills", "smoke-skill"), { recursive: true });
  await writeFile(join(consumer, "skills", "smoke-skill", "SKILL.md"), "---\nname: smoke-skill\ndescription: Use when asked to prove the packed consumer works.\n---\n\nReturn PACKED_SMOKE_OK.\n");
  await runPnpm(["exec", "agent-skill-evals", "init", "--skill", "./skills/smoke-skill", "--adapter", "codex"], consumer);
  await writeFile(join(consumer, "tests", "smoke-skill.yaml"), "skill: ../skills/smoke-skill\ntests:\n  - prompt: Prove the packed consumer works.\n    expect:\n      - output.contains: { text: PACKED_SMOKE_OK }\n");
  await writeFile(join(consumer, "agent.mjs"), 'console.log(JSON.stringify({ type: "agent_message", message: "PACKED_SMOKE_OK", usage: { total_tokens: 1 } }));\n');
  await writeFile(join(consumer, "promptfooconfig.yaml"), `prompts: ["{{prompt}}"]
providers:
  - id: file://./agent-skill-evals/agent.mjs
    config:
      adapter: codex-json
      command: node
      args: [../agent.mjs]
tests:
  path: file://./agent-skill-evals/test-generator.mjs
  config:
    path: ./tests/smoke-skill.yaml
    assertionPath: file://./agent-skill-evals/assertions.js
`);
  await runPnpm(["exec", "agent-skill-evals", "check", "./skills/smoke-skill", "--tests", "./tests/smoke-skill.yaml"], consumer);
  await runPnpm(["exec", "promptfoo", "eval", "--no-cache", "--no-write"], consumer, { PROMPTFOO_DISABLE_TELEMETRY: "1" });
} finally {
  if (process.env.AGENT_SKILL_EVALS_KEEP_PACK_SMOKE !== "1") await rm(root, { recursive: true, force: true });
  else console.log(`kept pack smoke workspace: ${root}`);
}

function runPnpm(args, cwd, env = {}) {
  return run(pnpm, [...prefix, ...args], cwd, env);
}

function run(command, args, cwd, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "inherit", "inherit"] });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${command} timed out`)); }, 120_000);
    child.on("exit", (code) => { clearTimeout(timer); code === 0 ? resolvePromise() : reject(new Error(`${command} ${args.join(" ")} failed with ${code}`)); });
    child.on("error", reject);
  });
}

function runCapture(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.on("exit", code => code === 0 ? resolvePromise(output) : reject(new Error(`${command} failed with ${code}`)));
    child.on("error", reject);
  });
}
