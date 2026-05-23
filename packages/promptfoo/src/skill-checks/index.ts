import { join, isAbsolute, resolve } from "node:path";
import * as Either from "effect/Either";
import * as Effect from "effect/Effect";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { parseSkillMdEffect, type ParsedSkill } from "./skill.js";
import { parseTestsPackEffect, type ParsedTestsPack } from "./tests-pack.js";
import { RUNTIME_CHECK_TYPES } from "../runtime-checks/check-set.js";
import {
  Environment,
  FileSystem,
  NodeServicesLive,
  YamlParser,
} from "../internal-services.js";

export interface StaticProviderConfig {
  /** Override for the cwd Promptfoo was launched from. */
  baseDir?: string;
}

const StaticProviderConfigSchema = Schema.Struct({
  baseDir: Schema.optional(Schema.String),
});

interface PromptfooContext {
  vars?: Record<string, unknown>;
  test?: { vars?: Record<string, unknown> };
}

interface ProviderResponse {
  output: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface StaticProviderMetadata {
  skill: ParsedSkill | null;
  tests: ParsedTestsPack | null;
  /** Combined missing files: skill references + verifier scripts + fixtures. */
  missingFiles: string[];
  /** Effect types referenced by tests but not in `knownEffectTypes`. */
  unresolvedEffectTypes: string[];
  warnings: string[];
}

class AgentSkillEvalsStaticProvider {
  config: StaticProviderConfig;
  private readonly configError?: string;
  id: () => string;

  constructor(options: { config?: StaticProviderConfig; id?: string } = {}) {
    const config = decodeStaticProviderConfig(options.config ?? {});
    if ("error" in config) {
      this.config = {};
      this.configError = config.error;
    } else {
      this.config = config;
    }
    const label = options.id ?? "agent-skill-evals-static";
    this.id = () => label;
  }

  async callApi(
    _prompt: string,
    context: PromptfooContext = {},
  ): Promise<ProviderResponse> {
    return Effect.runPromise(
      this.callApiEffect(_prompt, context).pipe(Effect.provide(NodeServicesLive)),
    );
  }

  private callApiEffect(
    _prompt: string,
    context: PromptfooContext = {},
  ): Effect.Effect<ProviderResponse, never, FileSystem | Environment | YamlParser> {
    const self = this;
    return Effect.gen(function* () {
    if (self.configError) {
      return { output: "", error: self.configError };
    }
    const vars = (context.vars ?? context.test?.vars ?? {}) as Record<string, unknown>;
    const environment = yield* Environment;
    const cwd = yield* environment.cwd;
    const baseDir = self.config.baseDir ?? cwd;
    const knownTypes = new Set<string>(RUNTIME_CHECK_TYPES);

    const skillPath = stringVar(vars, "skillPath");
    const testsGlob = stringVar(vars, "testsGlob");
    const warnings: string[] = [];

    if (!skillPath) {
      return {
        output: "",
        error: 'skill checks: vars.skillPath is required (example: skillPath: ./skills/bugfix-workflow)',
      };
    }
    if (!testsGlob) {
      return {
        output: "",
        error: 'skill checks: vars.testsGlob is required (example: testsGlob: ./tests/bugfix-workflow.yaml)',
      };
    }

    let skill: ParsedSkill | null = null;
    const skillAbs = isAbsolute(skillPath) ? skillPath : resolve(baseDir, skillPath);
    const skillMd = yield* ensureSkillMdEffect(skillAbs);
    if (skillMd === null) {
      return {
        output: "",
        error: `skill checks: SKILL.md not found at ${skillAbs}`,
      };
    }
    const parsedSkill = yield* Effect.either(parseSkillMdEffect(skillMd));
    if (Either.isLeft(parsedSkill)) {
      return {
        output: "",
        error: `skill checks: failed to parse SKILL.md at ${skillMd}: ${parsedSkill.left instanceof Error ? parsedSkill.left.message : String(parsedSkill.left)}`,
      };
    }
    skill = parsedSkill.right;

    let tests: ParsedTestsPack | null = null;
    tests = yield* parseTestsPackEffect({ testsGlob, baseDir, knownEffectTypes: knownTypes });

    const missingFiles: string[] = [];
    if (skill) {
      for (const ref of skill.missingReferences) missingFiles.push(`${skill.skillDir}/${ref}`);
    }
    if (tests) {
      missingFiles.push(...tests.missingVerifierScripts);
      missingFiles.push(...tests.missingFixturePaths);
    }

    const metadata: StaticProviderMetadata = {
      skill,
      tests,
      missingFiles,
      unresolvedEffectTypes: tests?.unresolvedEffectTypes ?? [],
      warnings,
    };

    return {
      output: summarise(metadata),
      metadata: metadata as unknown as Record<string, unknown>,
    };
    });
  }
}

function decodeStaticProviderConfig(input: unknown): StaticProviderConfig | { error: string } {
  const decoded = Schema.decodeUnknownEither(StaticProviderConfigSchema, {
    errors: "all",
  })(input ?? {});
  if (Either.isRight(decoded)) return decoded.right;
  return {
    error: `skill checks: invalid config: ${ParseResult.TreeFormatter.formatErrorSync(decoded.left)}`,
  };
}

function stringVar(vars: Record<string, unknown>, key: string): string | undefined {
  const value = vars[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function ensureSkillMdEffect(
  skillPath: string,
): Effect.Effect<string | null, never, FileSystem> {
  return Effect.gen(function* () {
  const fs = yield* FileSystem;
  // Accept either `…/SKILL.md` directly or a directory containing it.
  const statResult = yield* fs.stat(skillPath).pipe(Effect.either);
  if (Either.isRight(statResult)) {
    const s = statResult.right;
    if (s.isFile()) return skillPath;
    if (s.isDirectory()) {
      const candidate = join(skillPath, "SKILL.md");
      const cs = yield* fs.stat(candidate).pipe(
        Effect.catchAll(() => Effect.succeed(null)),
      );
      return cs && cs.isFile() ? candidate : null;
    }
    return null;
  }
  return null;
  });
}

function summarise(m: StaticProviderMetadata): string {
  const lines: string[] = ["Agent Skill Evals skill check input loaded:"];
  if (m.skill) {
    lines.push(`- skill: ${m.skill.frontmatter.name ?? "?"} (${m.skill.skillMdPath})`);
  }
  if (m.tests) {
    lines.push(`- tests: ${m.tests.tests.length} case(s) from ${m.tests.matchedFiles.length} file(s)`);
  }
  if (m.missingFiles.length) lines.push(`- missing files: ${m.missingFiles.length}`);
  if (m.unresolvedEffectTypes.length) {
    lines.push(`- unresolved effect types: ${m.unresolvedEffectTypes.length}`);
  }
  lines.push(
    m.warnings.length
      ? `- warnings: ${m.warnings.join("; ")}`
      : "- warnings: none",
  );
  return lines.join("\n");
}

export default AgentSkillEvalsStaticProvider;
export { AgentSkillEvalsStaticProvider };
export { parseSkillMd } from "./skill.js";
export { parseTestsPack } from "./tests-pack.js";
export type { ParsedSkill, ParsedTestsPack };
