import { join, isAbsolute, resolve as resolvePath } from "node:path";
import * as Effect from "effect/Effect";
import {
  parseAssertionEntries,
  parseRuntimeTestFields,
  type AssertionEntry,
  type AssertionEntryError,
} from "../assertion-entries.js";
import { decodeStaticTestCase, decodeTestPackDocument } from "./schemas.js";
import {
  FileSystem,
  NodeServicesLive,
  pathExecutable,
  pathExists,
  YamlParser,
} from "../internal-services.js";

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
  /** True if the test declares any precondition. */
  hasPrecondition: boolean;
  /** True if the test declares an Agent Skill Evals token budget assertion. */
  hasTokenBudget: boolean;
  /** True if the file or vars marks the test as draft. */
  isDraft: boolean;
  /** Authoring diagnostics for malformed Agent Skill Evals assertion entries. */
  entryErrors: AssertionEntryError[];
}

export interface ParsedTestsPack {
  /** YAML files matched by `testsGlob`. */
  matchedFiles: string[];
  /** All test cases discovered. */
  tests: ParsedTest[];
  /** Files that failed to parse (with error messages). */
  parseErrors: Array<{ filePath: string; error: string }>;
  /** Verifier scripts referenced by `verifier.succeeds`/`verifier.fails`. */
  verifierScripts: string[];
  /** Verifier scripts that don't exist on disk. */
  missingVerifierScripts: string[];
  /** Verifier scripts that exist but are not executable by the current user. */
  nonExecutableVerifierScripts: string[];
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
  return Effect.runPromise(parseTestsPackEffect(input).pipe(Effect.provide(NodeServicesLive)));
}

export function parseTestsPackEffect(input: {
  testsGlob: string;
  baseDir: string;
  knownEffectTypes: ReadonlySet<string>;
}): Effect.Effect<ParsedTestsPack, never, FileSystem | YamlParser> {
  return Effect.gen(function* () {
  const fs = yield* FileSystem;
  const yaml = yield* YamlParser;
  const files = yield* expandGlobEffect(input.testsGlob, input.baseDir);
  const tests: ParsedTest[] = [];
  const parseErrors: Array<{ filePath: string; error: string }> = [];

  for (const file of files) {
    const parsedFile = yield* Effect.either(Effect.gen(function* () {
      const raw = yield* fs.readText(file);
      const parsed = yield* yaml.parse(raw);
      const document = decodeTestPackDocument(parsed);
      if (document.parseError) {
        return { error: document.parseError };
      }
      return { cases: document.cases.map((c) => parseCase(file, c)) };
    }));
    if (parsedFile._tag === "Left") {
      parseErrors.push({ filePath: file, error: String(parsedFile.left) });
    } else if ("error" in parsedFile.right && parsedFile.right.error !== undefined) {
      parseErrors.push({ filePath: file, error: parsedFile.right.error });
    } else {
      tests.push(...parsedFile.right.cases);
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
  const nonExecutableVerifierScripts: string[] = [];
  for (const s of verifierScripts) {
    if (!(yield* pathExists(s))) {
      missingVerifierScripts.push(s);
    } else if (!(yield* pathExecutable(s))) {
      nonExecutableVerifierScripts.push(s);
    }
  }

  const fixturePaths = uniq(
    tests
      .map((t) => (typeof t.vars.fixture === "string" ? t.vars.fixture : null))
      .filter((p): p is string => p !== null)
      .map((p) => (isAbsolute(p) ? p : resolvePath(input.baseDir, p))),
  );
  const missingFixturePaths: string[] = [];
  for (const p of fixturePaths) {
    if (!(yield* pathExists(p))) missingFixturePaths.push(p);
  }

  const allEffectTypes = uniq(tests.flatMap((t) => t.effectTypes));
  const unresolvedEffectTypes = allEffectTypes.filter(
    (e) => !input.knownEffectTypes.has(e),
  );

  return {
    matchedFiles: files,
    tests,
    parseErrors,
    verifierScripts,
    missingVerifierScripts,
    nonExecutableVerifierScripts,
    fixturePaths,
    missingFixturePaths,
    unresolvedEffectTypes,
  };
  });
}

function parseCase(filePath: string, input: unknown): ParsedTest {
  const decoded = decodeStaticTestCase(input);
  const c = decoded.caseRecord;
  const vars = decoded.vars;
  const description = typeof c.description === "string" ? c.description : undefined;
  const parsed = parseRuntimeTestFields(vars);
  const allEntries = [...parsed.preconditions, ...parsed.should, ...parsed.should_not];
  const effectTypes = uniq(allEntries.map((entry) => entry.type));
  const entryErrors = [...decoded.entryErrors, ...parsed.errors];
  const isNegative =
    vars.kind === "negative" ||
    (Array.isArray(vars.should_not) && vars.should_not.length > 0 &&
      (!Array.isArray(vars.should) || vars.should.length === 0));
  const hasFixture =
    typeof vars.fixture === "string" || vars.fixtureless === true;
  const hasPrecondition =
    Array.isArray(vars.preconditions) && vars.preconditions.length > 0;
  const hasTokenBudget = declaresTokenBudget(c.assert);
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
    hasPrecondition,
    hasTokenBudget,
    isDraft,
    entryErrors,
  };
}

function declaresTokenBudget(assertions: unknown): boolean {
  if (!Array.isArray(assertions)) return false;
  return assertions.some((assertion) => {
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      return false;
    }
    const record = assertion as Record<string, unknown>;
    if (record.metric === "skill.budget") return true;
    const config = record.config && typeof record.config === "object" && !Array.isArray(record.config)
      ? record.config as Record<string, unknown>
      : {};
    return config.metric === "skill.budget";
  });
}

function collectVerifierScripts(vars: Record<string, unknown>): string[] {
  const out: string[] = [];
  const parsed = {
    preconditions: parseAssertionEntries(vars.preconditions, "preconditions", { allowMissing: true }),
    should: parseAssertionEntries(vars.should, "should", { allowMissing: true }),
    should_not: parseAssertionEntries(vars.should_not, "should_not", { allowMissing: true }),
  };
  for (const entries of Object.values(parsed)) {
    for (const entry of entries.entries) {
      if (!isVerifierEntry(entry)) continue;
      if (
        entry.args &&
        typeof entry.args === "object" &&
        typeof (entry.args as { run?: unknown }).run === "string"
      ) {
        out.push((entry.args as { run: string }).run);
      }
    }
  }
  return out;
}

function isVerifierEntry(entry: AssertionEntry): boolean {
  return entry.type === "verifier.succeeds" || entry.type === "verifier.fails";
}

function absolveScript(scriptPath: string, fixtureRoot: string): string {
  if (isAbsolute(scriptPath)) return scriptPath;
  // Verifier `run` paths are relative to the fixture root (since the agent
  // executes with cwd = world/fixture).
  return resolvePath(fixtureRoot, scriptPath);
}

function uniq<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}

/**
 * Tiny glob expander. Handles literal paths, `**\/*.yaml`, and a single `*`
 * segment. Sufficient for Agent Skill Evals conventions.
 */
function expandGlobEffect(
  pattern: string,
  baseDir: string,
): Effect.Effect<string[], never, FileSystem> {
  return Effect.gen(function* () {
  const fs = yield* FileSystem;
  const abs = isAbsolute(pattern) ? pattern : resolvePath(baseDir, pattern);
  // Literal file
  const absStat = yield* fs.stat(abs).pipe(Effect.either);
  if (absStat._tag === "Right" && absStat.right.isFile()) return [abs];
  // Literal directory: list yaml files
  if (absStat._tag === "Right" && absStat.right.isDirectory()) {
    return yield* listYamlEffect(abs);
  }
  // Pattern: split into root + glob
  const idx = abs.search(/\*\*?|\*/);
  if (idx < 0) return [];
  const root = abs.slice(0, idx).replace(/\/$/, "") || "/";
  const tail = abs.slice(idx);
  const matches: string[] = [];
  yield* walkEffect(root, (p) => Effect.sync(() => {
    if (matchesGlob(p, root, tail)) matches.push(p);
  }));
  return matches;
  });
}

function listYamlEffect(dir: string): Effect.Effect<string[], never, FileSystem> {
  return Effect.gen(function* () {
  const out: string[] = [];
  yield* walkEffect(dir, (p) => Effect.sync(() => {
    if (p.endsWith(".yaml") || p.endsWith(".yml")) out.push(p);
  }));
  return out;
  });
}

function walkEffect(
  dir: string,
  visit: (p: string) => Effect.Effect<void, never, FileSystem>,
): Effect.Effect<void, never, FileSystem> {
  return Effect.gen(function* () {
  const fs = yield* FileSystem;
  const entries = yield* fs.readDirectory(dir).pipe(
    Effect.catchAll(() => Effect.succeed([])),
  );
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      yield* walkEffect(p, visit);
    } else if (e.isFile()) {
      yield* visit(p);
    }
  }
  });
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
