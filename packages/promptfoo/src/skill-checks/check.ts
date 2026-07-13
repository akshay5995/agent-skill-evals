import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { loadTestPack, type CleanTestCase, type CleanTestPack, type MockService } from "../test-pack.js";
import { parseSkillMd, type ParsedSkill } from "./skill.js";
import { RUNTIME_CHECK_TYPES } from "../runtime-checks/catalog.js";

export type DiagnosticLevel = "error" | "warning";

export interface CheckDiagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  path?: string;
  suggestion?: string;
}

export interface CheckSkillProjectOptions {
  cwd?: string;
  skillPath: string;
  testPackPath?: string;
  strict?: boolean;
}

export interface CheckSkillProjectResult {
  schemaVersion: 1;
  ok: boolean;
  skill: string;
  testPack: string;
  diagnostics: CheckDiagnostic[];
}

const WHEN_TO_USE_RE = /\b(use when|use this|when (?:the )?(?:user|you))\b/i;
const WHEN_NOT_RE = /\bdo not use|do not invoke|don'?t use|not for|avoid using\b/i;
const KNOWN_CHECKS = new Set<string>(RUNTIME_CHECK_TYPES);

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveSkillMd(path: string): Promise<string> {
  if (await isFile(path)) return path;
  return join(path, "SKILL.md");
}

function diagnostic(
  level: DiagnosticLevel,
  code: string,
  message: string,
  path?: string,
  suggestion?: string,
): CheckDiagnostic {
  return {
    level,
    code,
    message,
    ...(path ? { path } : {}),
    ...(suggestion ? { suggestion } : {}),
  };
}

function checkSkillQuality(skill: ParsedSkill): CheckDiagnostic[] {
  const out: CheckDiagnostic[] = [];
  const name = typeof skill.frontmatter.name === "string" ? skill.frontmatter.name.trim() : "";
  const description = typeof skill.frontmatter.description === "string"
    ? skill.frontmatter.description.trim()
    : "";
  if (!name) {
    out.push(diagnostic("error", "skill.name.missing", "SKILL.md frontmatter requires a non-empty name.", skill.skillMdPath));
  }
  if (!description) {
    out.push(diagnostic("error", "skill.description.missing", "SKILL.md frontmatter requires a non-empty description.", skill.skillMdPath));
  } else if (skill.frontmatter["disable-model-invocation"] !== true) {
    if (!WHEN_TO_USE_RE.test(description)) {
      out.push(diagnostic("warning", "skill.routing.when", "The description does not clearly say when the skill should be used.", skill.skillMdPath, "Add a concrete `Use when ...` trigger."));
    }
    if (!WHEN_NOT_RE.test(description)) {
      out.push(diagnostic("warning", "skill.routing.boundary", "The description does not clearly say when the skill should not be used.", skill.skillMdPath, "Add a concrete `Do not use for ...` boundary."));
    }
  }
  if (skill.totalLines > 200) {
    out.push(diagnostic("warning", "skill.size", `SKILL.md has ${skill.totalLines} lines; the default quality target is 200.`, skill.skillMdPath, "Move reference material into linked files."));
  }
  for (const reference of skill.missingReferences) {
    out.push(diagnostic("error", "skill.reference.missing", `Referenced file does not exist: ${reference}`, resolve(skill.skillDir, reference)));
  }
  return out;
}

function checkName(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const record = entry as Record<string, unknown>;
  if (typeof record.type === "string") return record.type;
  return Object.keys(record)[0];
}

function checkArgs(entry: unknown): Record<string, unknown> {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return {};
  const record = entry as Record<string, unknown>;
  if (typeof record.type === "string") return record;
  const key = Object.keys(record)[0];
  const value = key ? record[key] : undefined;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function checkVerifier(
  entry: unknown,
  fixtureRoot: string,
): Promise<CheckDiagnostic[]> {
  const name = checkName(entry);
  if (name !== "verifier.succeeds" && name !== "verifier.fails") return [];
  const run = checkArgs(entry).run;
  if (typeof run !== "string" || run.length === 0) return [];
  const executable = isAbsolute(run) ? run : resolve(fixtureRoot, run);
  if (!(await isFile(executable))) {
    return [diagnostic("error", "verifier.missing", `Verifier does not exist: ${run}`, executable, "Create the verifier or correct its run path.")];
  }
  if (!(await isExecutable(executable))) {
    return [diagnostic("error", "verifier.not_executable", `Verifier is not executable: ${run}`, executable, `Run chmod +x ${run}`)];
  }
  return [];
}

async function checkMock(mock: MockService, packDir: string): Promise<CheckDiagnostic[]> {
  const localFiles = mock.kind === "command"
    ? [mock.executable]
    : [
        ...(mock.command && (mock.command.startsWith("./") || mock.command.startsWith("../") || isAbsolute(mock.command))
          ? [mock.command]
          : []),
        ...mock.args.filter((value) => value.startsWith("./") || value.startsWith("../")),
      ];
  for (const value of localFiles) {
    if (!(value.startsWith("./") || value.startsWith("../") || isAbsolute(value))) continue;
    const path = isAbsolute(value) ? value : resolve(packDir, value);
    if (!(await isFile(path))) return [diagnostic("error", "mock.file.missing", `Mock Service file does not exist: ${value}`, path)];
  }
  if (mock.kind === "command") {
    const path = isAbsolute(mock.executable) ? mock.executable : resolve(packDir, mock.executable);
    if (!(await isFile(path))) return [diagnostic("error", "mock.executable.missing", `Mock command does not exist: ${mock.executable}`, path)];
    if (!(await isExecutable(path))) return [diagnostic("error", "mock.executable.not_executable", `Mock command is not executable: ${mock.executable}`, path)];
  }
  if (mock.kind === "mcp" && mock.transport === "stdio" && !mock.command) {
    return [diagnostic("error", "mock.mcp.command", `MCP stdio mock "${mock.name}" requires a command.`)];
  }
  if (mock.kind === "mcp" && mock.transport === "http" && !mock.url) {
    return [diagnostic("error", "mock.mcp.url", `MCP HTTP mock "${mock.name}" requires a URL.`)];
  }
  return [];
}

async function checkCase(
  test: CleanTestCase,
  pack: CleanTestPack,
  packDir: string,
): Promise<CheckDiagnostic[]> {
  const out: CheckDiagnostic[] = [];
  const fixturePath = test.fixture
    ? isAbsolute(test.fixture) ? test.fixture : resolve(packDir, test.fixture)
    : undefined;
  if (fixturePath && !(await isDirectory(fixturePath))) {
    out.push(diagnostic("error", "fixture.missing", `Fixture directory does not exist: ${test.fixture}`, fixturePath));
  }
  const verifierRoot = fixturePath ?? packDir;
  for (const entry of [...test.preconditions, ...test.expect]) {
    const name = checkName(entry);
    if (!name || !KNOWN_CHECKS.has(name)) {
      out.push(diagnostic("error", "check.unknown", `Unknown expectation: ${name ?? "invalid entry"}`));
      continue;
    }
    out.push(...await checkVerifier(entry, verifierRoot));
  }
  for (const mock of [...(pack.environment?.mocks ?? []), ...(test.environment?.mocks ?? [])]) {
    out.push(...await checkMock(mock, packDir));
  }
  const mocks = [...(pack.environment?.mocks ?? []), ...(test.environment?.mocks ?? [])];
  const expectedChecks = test.expect.map(checkName);
  if (test.mode === "routing" && !expectedChecks.includes("skill.loaded")) {
    out.push(diagnostic("error", "routing.skill_loaded.required", "Routing Tests must prove that the target skill was loaded."));
  }
  const hasDistractors =
    pack.builtin_distractor ||
    pack.distractor_skills.length > 0 ||
    (test.distractor_skills?.length ?? 0) > 0;
  if (test.mode === "routing" && hasDistractors && !expectedChecks.includes("skill.not_loaded")) {
    out.push(diagnostic("error", "routing.skill_not_loaded.required", "Routing Tests with distractors must prove that unrelated skills were not loaded."));
  }
  const hasSkillEvidence = mocks.some(
    (mock) => mock.kind === "mcp" && mock.provides_skill_evidence,
  );
  if (test.mode === "routing" && expectedChecks.includes("skill.loaded") && !hasSkillEvidence) {
    out.push(diagnostic(
      "error",
      "routing.observation.unsupported",
      "Native skill discovery does not currently expose trustworthy load evidence for routing assertions.",
      undefined,
      "Add an MCP boundary that emits observable skill-load telemetry and set provides_skill_evidence: true.",
    ));
  }
  if (!test.budget) {
    out.push(diagnostic("warning", "budget.missing", `Test "${test.description ?? test.prompt}" has no token budget.`, undefined, "Add a budget after observing a representative passing run."));
  }
  return out;
}

export async function checkSkillProject(
  options: CheckSkillProjectOptions,
): Promise<CheckSkillProjectResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const requestedSkill = isAbsolute(options.skillPath) ? options.skillPath : resolve(cwd, options.skillPath);
  const skillMd = await resolveSkillMd(requestedSkill);
  const skillName = basename(dirname(skillMd));
  const testPack = options.testPackPath
    ? isAbsolute(options.testPackPath) ? options.testPackPath : resolve(cwd, options.testPackPath)
    : resolve(cwd, "tests", `${skillName}.yaml`);
  const diagnostics: CheckDiagnostic[] = [];

  let skill: ParsedSkill | undefined;
  try {
    skill = await parseSkillMd(skillMd);
    diagnostics.push(...checkSkillQuality(skill));
  } catch (error) {
    diagnostics.push(diagnostic("error", "skill.read", `Could not read SKILL.md: ${error instanceof Error ? error.message : String(error)}`, skillMd));
  }

  let pack: CleanTestPack | undefined;
  try {
    pack = await loadTestPack(testPack);
  } catch (error) {
    diagnostics.push(diagnostic("error", "test_pack.read", error instanceof Error ? error.message : String(error), testPack));
  }

  if (pack) {
    const declaredSkill = resolve(dirname(testPack), pack.skill);
    const actualSkillDir = dirname(skillMd);
    if (declaredSkill !== actualSkillDir && declaredSkill !== skillMd) {
      diagnostics.push(diagnostic("error", "test_pack.skill_mismatch", `Test Pack declares ${pack.skill}, which does not match the checked skill.`, declaredSkill, `Set skill: ${options.skillPath}`));
    }
    for (const test of pack.tests) diagnostics.push(...await checkCase(test, pack, dirname(testPack)));
  }

  const hasErrors = diagnostics.some((item) => item.level === "error");
  const hasWarnings = diagnostics.some((item) => item.level === "warning");
  return {
    schemaVersion: 1,
    ok: !hasErrors && !(options.strict && hasWarnings),
    skill: skillMd,
    testPack,
    diagnostics,
  };
}
