import { readFile, readdir, stat } from "node:fs/promises";
import { join, isAbsolute, resolve as resolvePath } from "node:path";
import { parse as parseYaml } from "yaml";

export interface ParsedTest {
  /** Absolute path of the YAML file containing this test. */
  filePath: string;
  description?: string;
  vars: Record<string, unknown>;
  /** Effect-type strings referenced by preconditions/should/should_not. */
  effectTypes: string[];
  /** Whether `vars.fixture` was set (or `fixtureless` flagged). */
  hasFixture: boolean;
  /** True if the test is `kind: negative` (or has no positive should + has should_not). */
  isNegative: boolean;
  /** True if the test asserts any mcp.* effect. */
  usesMcpAssertions: boolean;
  /** True if the test declares any precondition. */
  hasPrecondition: boolean;
  /** True if the file or vars marks the test as draft. */
  isDraft: boolean;
}

export interface ParsedTestsPack {
  /** All test cases discovered. */
  tests: ParsedTest[];
  /** Files that failed to parse (with error messages). */
  parseErrors: Array<{ filePath: string; error: string }>;
  /** Verifier scripts referenced by `verifier.succeeds`/`verifier.fails`. */
  verifierScripts: string[];
  /** Verifier scripts that don't exist on disk. */
  missingVerifierScripts: string[];
  /** Fixture paths referenced by tests. */
  fixturePaths: string[];
  /** Fixture paths that don't exist on disk. */
  missingFixturePaths: string[];
  /** Effect types not in the supplied known-types set. */
  unresolvedEffectTypes: string[];
}

export async function parseTestsPack(input: {
  testsGlob: string;
  baseDir: string;
  knownEffectTypes: ReadonlySet<string>;
}): Promise<ParsedTestsPack> {
  const files = await expandGlob(input.testsGlob, input.baseDir);
  const tests: ParsedTest[] = [];
  const parseErrors: Array<{ filePath: string; error: string }> = [];

  for (const file of files) {
    try {
      const raw = await readFile(file, "utf8");
      const parsed = parseYaml(raw);
      const cases = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of cases) {
        if (!c || typeof c !== "object") continue;
        tests.push(parseCase(file, c as Record<string, unknown>));
      }
    } catch (err) {
      parseErrors.push({ filePath: file, error: String(err) });
    }
  }

  const verifierScripts = uniq(
    tests.flatMap((t) => {
      const fixtureRoot =
        typeof t.vars.fixture === "string"
          ? isAbsolute(t.vars.fixture)
            ? t.vars.fixture
            : resolvePath(input.baseDir, t.vars.fixture)
          : input.baseDir;
      return collectVerifierScripts(t.vars).map((p) =>
        absolveScript(p, fixtureRoot),
      );
    }),
  );
  const missingVerifierScripts: string[] = [];
  for (const s of verifierScripts) {
    if (!(await pathExists(s))) missingVerifierScripts.push(s);
  }

  const fixturePaths = uniq(
    tests
      .map((t) => (typeof t.vars.fixture === "string" ? t.vars.fixture : null))
      .filter((p): p is string => p !== null)
      .map((p) => (isAbsolute(p) ? p : resolvePath(input.baseDir, p))),
  );
  const missingFixturePaths: string[] = [];
  for (const p of fixturePaths) {
    if (!(await pathExists(p))) missingFixturePaths.push(p);
  }

  const allEffectTypes = uniq(tests.flatMap((t) => t.effectTypes));
  const unresolvedEffectTypes = allEffectTypes.filter(
    (e) => !input.knownEffectTypes.has(e),
  );

  return {
    tests,
    parseErrors,
    verifierScripts,
    missingVerifierScripts,
    fixturePaths,
    missingFixturePaths,
    unresolvedEffectTypes,
  };
}

function parseCase(filePath: string, c: Record<string, unknown>): ParsedTest {
  const vars = (c.vars ?? {}) as Record<string, unknown>;
  const description = typeof c.description === "string" ? c.description : undefined;
  const effectTypes = collectEffectTypes(vars);
  const usesMcpAssertions = effectTypes.some((e) => e.startsWith("mcp."));
  const isNegative =
    vars.kind === "negative" ||
    (Array.isArray(vars.should_not) && vars.should_not.length > 0 &&
      (!Array.isArray(vars.should) || vars.should.length === 0));
  const hasFixture =
    typeof vars.fixture === "string" || vars.fixtureless === true;
  const hasPrecondition =
    Array.isArray(vars.preconditions) && vars.preconditions.length > 0;
  const isDraft =
    vars.draft === true ||
    (typeof c.metadata === "object" &&
      c.metadata !== null &&
      (c.metadata as Record<string, unknown>).draft === true);
  return {
    filePath,
    description,
    vars,
    effectTypes,
    hasFixture,
    isNegative,
    usesMcpAssertions,
    hasPrecondition,
    isDraft,
  };
}

function collectEffectTypes(vars: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const key of ["preconditions", "should", "should_not"]) {
    const arr = vars[key];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (typeof entry === "string") {
        out.add(entry);
        continue;
      }
      if (entry && typeof entry === "object") {
        const e = entry as Record<string, unknown>;
        if (typeof e.type === "string") {
          out.add(e.type);
          continue;
        }
        const keys = Object.keys(e);
        if (keys.length === 1) out.add(keys[0]!);
      }
    }
  }
  return [...out];
}

function collectVerifierScripts(vars: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ["preconditions", "should", "should_not"]) {
    const arr = vars[key];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const args =
        typeof e.type === "string" ? e :
        Object.keys(e).length === 1 ? (e[Object.keys(e)[0]!] as Record<string, unknown> | undefined) :
        undefined;
      if (args && typeof args === "object" && typeof (args as { run?: unknown }).run === "string") {
        out.push((args as { run: string }).run);
      }
    }
  }
  return out;
}

function absolveScript(scriptPath: string, fixtureRoot: string): string {
  if (isAbsolute(scriptPath)) return scriptPath;
  // Verifier `run` paths are relative to the fixture root (since the agent
  // executes with cwd = world/fixture).
  return resolvePath(fixtureRoot, scriptPath);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function uniq<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}

/**
 * Tiny glob expander. Handles literal paths, `**\/*.yaml`, and a single `*`
 * segment. Sufficient for SkillKit conventions.
 */
async function expandGlob(pattern: string, baseDir: string): Promise<string[]> {
  const abs = isAbsolute(pattern) ? pattern : resolvePath(baseDir, pattern);
  // Literal file
  if (await pathExists(abs) && (await stat(abs)).isFile()) return [abs];
  // Literal directory: list yaml files
  if (await pathExists(abs)) {
    const s = await stat(abs);
    if (s.isDirectory()) return listYaml(abs);
  }
  // Pattern: split into root + glob
  const idx = abs.search(/\*\*?|\*/);
  if (idx < 0) return [];
  const root = abs.slice(0, idx).replace(/\/$/, "") || "/";
  const tail = abs.slice(idx);
  const matches: string[] = [];
  await walk(root, async (p) => {
    if (matchesGlob(p, root, tail)) matches.push(p);
  });
  return matches;
}

async function listYaml(dir: string): Promise<string[]> {
  const out: string[] = [];
  await walk(dir, async (p) => {
    if (p.endsWith(".yaml") || p.endsWith(".yml")) out.push(p);
  });
  return out;
}

async function walk(dir: string, visit: (p: string) => Promise<void>): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      await walk(p, visit);
    } else if (e.isFile()) {
      await visit(p);
    }
  }
}

function matchesGlob(p: string, root: string, tail: string): boolean {
  if (!p.startsWith(root)) return false;
  const rel = p.slice(root.length).replace(/^\//, "");
  const re = new RegExp(
    "^" +
      tail
        .replace(/^\//, "")
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*\//g, "(?:.*/)?")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*") +
      "$",
  );
  return re.test(rel);
}
