import { cp, copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { EvidenceCollector } from "./evidence.js";

type SkillRole = "under-test" | "supporting" | "distractor";

export interface PreparedSkillEnvironment {
  env: NodeJS.ProcessEnv;
  args: string[];
  formatPrompt: (prompt: string) => string;
}

interface DeclaredSkill {
  source: string;
  name: string;
  role: SkillRole;
}

const BUILTIN_DISTRACTOR_NAME = "agent-skill-evals-neutral";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function skillName(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  return basename(normalized).replace(/\.md$/i, "");
}

function resolveSkill(path: string, baseDir: string): string {
  return isAbsolute(path) ? path : resolve(baseDir, path);
}

function minimalEnvironment(source: NodeJS.ProcessEnv, home: string): NodeJS.ProcessEnv {
  const exact = new Set([
    "PATH", "SHELL", "TERM", "LANG", "LC_ALL", "TMPDIR", "TEMP", "TMP",
    "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX", "AWS_PROFILE", "AWS_REGION", "GOOGLE_APPLICATION_CREDENTIALS",
  ]);
  const prefixes = ["OPENAI_", "ANTHROPIC_", "CLAUDE_CODE_", "PI_", "AWS_", "AZURE_", "GOOGLE_"];
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && (exact.has(key) || prefixes.some((prefix) => key.startsWith(prefix)))) {
      env[key] = value;
    }
  }
  env.HOME = home;
  env.CODEX_HOME = join(home, ".codex");
  env.CLAUDE_CONFIG_DIR = join(home, ".claude");
  return env;
}

async function copyAuthFile(sourceHome: string, isolatedHome: string, relativePath: string): Promise<void> {
  const source = join(sourceHome, relativePath);
  if (!(await pathExists(source))) return;
  const destination = join(isolatedHome, relativePath);
  if (await pathExists(destination)) return;
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function prepareAuthHome(isolatedHome: string): Promise<void> {
  await mkdir(isolatedHome, { recursive: true });
  const sourceHome = process.env.HOME;
  if (!sourceHome) return;
  for (const path of [
    ".codex/auth.json",
    ".pi/agent/auth.json",
  ]) {
    await copyAuthFile(sourceHome, isolatedHome, path);
  }
}

async function makeBuiltinDistractor(runDir: string): Promise<string> {
  const dir = join(runDir, "builtin-skills", BUILTIN_DISTRACTOR_NAME);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: ${BUILTIN_DISTRACTOR_NAME}`,
      "description: Use only when the user explicitly asks to explain a neutral checksum example. Do not use for other work.",
      "---",
      "",
      "Explain a checksum example without changing files.",
    ].join("\n"),
  );
  return dir;
}

async function declaredSkills(input: {
  runDir: string;
  vars: Record<string, unknown>;
  baseDir: string;
}): Promise<DeclaredSkill[]> {
  const target = input.vars.skillPath;
  if (typeof target !== "string" || target.length === 0) return [];
  const skills: DeclaredSkill[] = [{
    source: resolveSkill(target, input.baseDir),
    name: skillName(target),
    role: "under-test",
  }];
  for (const path of Array.isArray(input.vars.supportingSkills) ? input.vars.supportingSkills : []) {
    if (typeof path === "string") skills.push({ source: resolveSkill(path, input.baseDir), name: skillName(path), role: "supporting" });
  }
  for (const path of Array.isArray(input.vars.distractorSkills) ? input.vars.distractorSkills : []) {
    if (typeof path === "string") skills.push({ source: resolveSkill(path, input.baseDir), name: skillName(path), role: "distractor" });
  }
  if (input.vars.mode === "routing" && input.vars.builtinDistractor === true) {
    const source = await makeBuiltinDistractor(input.runDir);
    skills.push({ source, name: BUILTIN_DISTRACTOR_NAME, role: "distractor" });
  }
  return skills;
}

async function copySkill(source: string, destination: string): Promise<void> {
  if (!(await pathExists(source))) throw new Error(`declared skill does not exist: ${source}`);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}

function explicitPrompt(preset: string | undefined, name: string, prompt: string): string {
  if (preset === "claude-code") return `/${name}\n\n${prompt}`;
  if (preset === "pi") return `/skill:${name} ${prompt}`;
  return `$${name}\n\n${prompt}`;
}

function insertBeforeStdin(args: readonly string[], additions: readonly string[]): string[] {
  const copy = [...args];
  const marker = copy.lastIndexOf("-");
  if (marker >= 0) copy.splice(marker, 0, ...additions);
  else copy.push(...additions);
  return copy;
}

export async function prepareSkillEnvironment(input: {
  runDir: string;
  authHome?: string;
  worldPath: string;
  vars: Record<string, unknown>;
  baseDir: string;
  preset?: string;
  adapter: string;
  args: readonly string[];
  prompt: string;
  evidence: EvidenceCollector;
  extraEnv?: NodeJS.ProcessEnv;
}): Promise<PreparedSkillEnvironment> {
  const skills = await declaredSkills(input);
  const isolatedHome = input.authHome ?? join(input.runDir, "home");
  await prepareAuthHome(isolatedHome);
  const env = { ...minimalEnvironment(process.env, isolatedHome), ...(input.extraEnv ?? {}) };
  const piSkillPaths: string[] = [];

  for (const skill of skills) {
    const codexPath = join(input.worldPath, ".agents", "skills", skill.name);
    const claudePath = join(input.worldPath, ".claude", "skills", skill.name);
    const isolatedPath = join(input.runDir, "skills", skill.name);
    await copySkill(skill.source, codexPath);
    await copySkill(skill.source, claudePath);
    await copySkill(skill.source, isolatedPath);
    piSkillPaths.push(isolatedPath);
    input.evidence.addSkillAvailable({ skill: skill.name, path: isolatedPath, role: skill.role });
  }

  let args = [...input.args];
  if (input.preset === "pi" || input.adapter === "pi-json") {
    const skillArgs = ["--no-skills", ...piSkillPaths.flatMap((path) => ["--skill", path])];
    args = insertBeforeStdin(args, skillArgs);
  }

  const target = skills[0];
  const behavior = input.vars.mode !== "routing" && target !== undefined;
  return {
    env,
    args,
    formatPrompt: behavior
      ? (prompt) => explicitPrompt(input.preset, target!.name, prompt)
      : (prompt) => prompt,
  };
}
