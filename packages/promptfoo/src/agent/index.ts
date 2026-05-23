import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import * as Clock from "effect/Clock";
import * as Either from "effect/Either";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import type { AgentSkillEvalsAssertionResult } from "../internal-types.js";
import { parseRuntimeTestFields } from "../assertion-entries.js";
import {
  getRuntimeCheck,
  RuntimeCheckCatalog,
  RuntimeCheckCatalogLive,
} from "../runtime-checks/catalog.js";
import {
  EvidenceCollector,
  evidenceFromSnapshot,
  type SkillEvidenceConfig,
  writeEvidenceToEffect,
} from "./evidence.js";
import {
  AdapterCatalog,
  AdapterCatalogLive,
  getAdapter,
} from "./adapter-catalog.js";
import {
  copyFixtureEffect,
  createRunDirEffect,
  makeWorldHandle,
} from "./world.js";
import { snapshotTreeEffect, diffTrees } from "./file-watch.js";
import { ProcessRunner, ProcessRunnerLive } from "./command-runner.js";
import { Environment, FileSystem, NodeServicesLive } from "../internal-services.js";

interface ProviderConfig {
  adapter?: string;
  command?: string;
  args?: readonly string[];
  timeoutMs?: number;
  baseDir?: string;
  isolatedHome?: boolean;
  skillEvidence?: SkillEvidenceConfig;
}

const SkillEvidenceConfigSchema = Schema.Struct({
  mcpResource: Schema.optional(Schema.Struct({
    uriArgPaths: Schema.optional(Schema.Array(Schema.String)),
    uriPatterns: Schema.optional(Schema.Array(Schema.String)),
  })),
  mcpTool: Schema.optional(Schema.Struct({
    toolPatterns: Schema.optional(Schema.Array(Schema.String)),
  })),
  nativeArgs: Schema.optional(Schema.Struct({
    whenArgs: Schema.optional(Schema.Array(Schema.String)),
    whenAnyArgs: Schema.optional(Schema.Array(Schema.String)),
    skillPathFlags: Schema.optional(Schema.Array(Schema.String)),
    provider: Schema.optional(Schema.String),
    source: Schema.optional(Schema.String),
  })),
});

const ProviderConfigSchema = Schema.Struct({
  adapter: Schema.optional(Schema.String),
  command: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.String)),
  timeoutMs: Schema.optional(Schema.Number),
  baseDir: Schema.optional(Schema.String),
  isolatedHome: Schema.optional(Schema.Boolean),
  skillEvidence: Schema.optional(SkillEvidenceConfigSchema),
});

const DOCUMENTED_ADAPTERS = ["codex-json", "claude-code-json", "pi-json"] as const;

interface PromptfooContext {
  vars?: Record<string, unknown>;
  test?: { vars?: Record<string, unknown>; metadata?: Record<string, unknown> };
}

interface ProviderResponse {
  output: string;
  metadata?: Record<string, unknown>;
  cost?: number;
  tokenUsage?: { total?: number; prompt?: number; completion?: number; cached?: number };
  error?: string;
}

type AgentRequirements =
  | RuntimeCheckCatalog
  | AdapterCatalog
  | FileSystem
  | Environment
  | ProcessRunner;

const AgentLiveLayer = Layer.mergeAll(
  RuntimeCheckCatalogLive,
  AdapterCatalogLive,
  NodeServicesLive,
  ProcessRunnerLive,
);

export interface AgentSkillEvalsProviderMetadata {
  runDir: string;
  worldPath: string;
  evidencePath: string;
  fixture: string;
  skill?: string;
  kind?: string;
  preconditionResults: AgentSkillEvalsAssertionResult[];
  preconditionsPassed: boolean;
  durationMs: number;
}

interface PreparedRun {
  runDir: string;
  worldPath: string;
  world: ReturnType<typeof makeWorldHandle>;
  evidenceCollector: EvidenceCollector;
}

function asVars(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function varsFromContext(context: PromptfooContext): Record<string, unknown> {
  return asVars(context.vars) ?? asVars(context.test?.vars) ?? {};
}

function decodeProviderConfig(input: unknown): ProviderConfig | { error: string } {
  const decoded = Schema.decodeUnknownEither(ProviderConfigSchema, { errors: "all" })(
    input ?? {},
  );
  if (Either.isRight(decoded)) return decoded.right;
  return {
    error: `agent-skill-evals-provider: invalid config: ${ParseResult.TreeFormatter.formatErrorSync(decoded.left)}`,
  };
}

function prepareRunEffect(
  fixture: string,
  config: ProviderConfig,
): Effect.Effect<PreparedRun | { error: string }, never, FileSystem | Environment> {
  return Effect.gen(function* () {
    const created = yield* Effect.either(createRunDirEffect());
    if (Either.isLeft(created)) {
      return {
        error: `agent-skill-evals-provider: failed to create isolated world: ${created.left instanceof Error ? created.left.message : String(created.left)}`,
      };
    }
    const { runDir, worldPath } = created.right;
    const copied = yield* Effect.either(
      copyFixtureEffect({ fixturePath: fixture, baseDir: config.baseDir }, worldPath),
    );
    if (Either.isLeft(copied)) {
      return {
        error: `agent-skill-evals-provider: failed to copy vars.fixture "${fixture}" into isolated world: ${copied.left instanceof Error ? copied.left.message : String(copied.left)}`,
      };
    }

    const evidenceCollector = new EvidenceCollector(config.skillEvidence);
    return {
      runDir,
      worldPath,
      evidenceCollector,
      world: makeWorldHandle(worldPath, (event) => evidenceCollector.addCommand(event)),
    };
  });
}

function runPreconditionsEffect(
  vars: Record<string, unknown>,
  run: PreparedRun,
): Effect.Effect<{ results: AgentSkillEvalsAssertionResult[]; passed: boolean }, never, RuntimeCheckCatalog> {
  return Effect.gen(function* () {
  const results: AgentSkillEvalsAssertionResult[] = [];
  let passed = true;
  const parsed = parseRuntimeTestFields(vars);
  for (const error of parsed.errors.filter((e) => e.field === "preconditions")) {
    const at = error.index === undefined ? error.field : `${error.field}[${error.index}]`;
    results.push({
      pass: false,
      score: 0,
      reason: `precondition: ${at}: ${error.reason}`,
    });
    passed = false;
  }
  for (const entry of parsed.preconditions) {
    const plugin = yield* getRuntimeCheck(entry.type);
    if (!plugin) {
      results.push({
        pass: false,
        score: 0,
        reason: `precondition: unknown effect type "${entry.type}"`,
      });
      passed = false;
      continue;
    }
    const result = yield* plugin.verify({
      assertion: entry.args,
      world: run.world,
      evidence: evidenceFromSnapshot(run.evidenceCollector.toSnapshot()),
      mode: "precondition",
    });
    results.push(result);
    if (!result.pass) passed = false;
  }
  return { results, passed };
  });
}

function resolveConfiguredPath(baseDir: string, path: string): string {
  if (path.includes("=")) return path;
  return path.startsWith("./") ||
    path.startsWith("../") ||
    (!isAbsolute(path) && path.includes("/"))
    ? resolve(baseDir, path)
    : path;
}

function expandEnvVars(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(:-([^}]*))?\}/g, (_match, name: string, _fallbackPart: string, fallback: string | undefined) =>
    env[name] ?? fallback ?? "",
  );
}

function skillNameFromNativePath(path: string): string | undefined {
  const normalized = path.replace(/\/+$/, "");
  if (!normalized) return undefined;
  const leaf = basename(normalized);
  return leaf === "SKILL.md" ? basename(dirname(normalized)) : leaf.replace(/\.md$/i, "");
}

function addNativeSkillEvidenceFromConfig(
  run: PreparedRun,
  config: ProviderConfig,
  startedAt: number,
): void {
  const nativeConfig = nativeSkillEvidenceConfig(config);
  if (!nativeConfig) return;
  const args = config.args ?? [];
  if (!nativeConfig.whenArgs.every((arg) => args.includes(arg))) return;
  if (nativeConfig.whenAnyArgs.length > 0 && !nativeConfig.whenAnyArgs.some((arg) => args.includes(arg))) return;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    const source = nativeConfig.skillPathFlags.includes(arg) ? arg : undefined;
    if (!source) continue;
    const skillPath = args[index + 1];
    if (!skillPath) continue;
    const skill = skillNameFromNativePath(skillPath);
    if (!skill) continue;
    run.evidenceCollector.addSkillLoad({
      skill,
      delivery: "native",
      provider: nativeConfig.provider,
      source: nativeConfig.source ?? source,
      startedAt,
    });
  }
}

function nativeSkillEvidenceConfig(config: ProviderConfig): {
  whenArgs: readonly string[];
  whenAnyArgs: readonly string[];
  skillPathFlags: readonly string[];
  provider: string;
  source?: string;
} | undefined {
  const configured = config.skillEvidence?.nativeArgs;
  if (configured) {
    return {
      whenArgs: configured.whenArgs ?? [],
      whenAnyArgs: configured.whenAnyArgs ?? [],
      skillPathFlags: configured.skillPathFlags ?? ["--skill"],
      provider: configured.provider ?? config.adapter ?? "agent",
      source: configured.source,
    };
  }
  if (config.adapter === "pi-json") {
    return {
      whenArgs: [],
      whenAnyArgs: ["--no-skills", "-ns"],
      skillPathFlags: ["--skill"],
      provider: "pi-json",
      source: "--skill",
    };
  }
  return undefined;
}

function promptfooTokenUsage(usage: {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
}): ProviderResponse["tokenUsage"] {
  const tokenUsage = {
    ...(usage.totalTokens !== undefined ? { total: usage.totalTokens } : {}),
    ...(usage.inputTokens !== undefined ? { prompt: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { completion: usage.outputTokens } : {}),
    ...(usage.cacheReadTokens !== undefined ? { cached: usage.cacheReadTokens } : {}),
  };
  return Object.keys(tokenUsage).length > 0 ? tokenUsage : undefined;
}

function runConfiguredAdapterEffect(input: {
  prompt: string;
  run: PreparedRun;
  config: ProviderConfig;
}): Effect.Effect<
  { output: string; error?: string },
  never,
  AdapterCatalog | Environment | ProcessRunner
> {
  return Effect.gen(function* () {
  const adapterId = input.config.adapter;
  if (!adapterId) {
    return {
      output: "",
      error: "agent-skill-evals-provider: config.adapter is required. Use codex-json, claude-code-json, or pi-json.",
    };
  }
  const adapter = yield* getAdapter(adapterId);
  if (!adapter) {
    return {
      output: "",
      error: `agent-skill-evals-provider: unknown adapter "${adapterId}". Supported adapters: ${DOCUMENTED_ADAPTERS.join(", ")}`,
    };
  }
  if (!input.config.command) {
    return {
      output: "",
      error: "agent-skill-evals-provider: config.command is required for dynamic agent runs",
    };
  }
  const command = input.config.command;

  const environment = yield* Environment;
  const cwd = yield* environment.cwd;
  const env = yield* environment.env;
  const baseDir = input.config.baseDir ?? cwd;
  const result = yield* adapter.run({
    command: resolveConfiguredPath(baseDir, expandEnvVars(command, env)),
    args: (input.config.args ?? []).map((arg) =>
      typeof arg === "string" ? resolveConfiguredPath(baseDir, expandEnvVars(arg, env)) : arg,
    ),
    cwd: input.run.worldPath,
    prompt: input.prompt,
    evidence: input.run.evidenceCollector,
    timeoutMs: input.config.timeoutMs ?? 5 * 60_000,
    env: {
      ...env,
      ...(input.config.isolatedHome ? { HOME: join(input.run.runDir, "agent-home") } : {}),
    },
  });
  return { output: result.output, ...(result.error ? { error: result.error } : {}) };
  });
}

function collectFileEvidenceEffect(
  run: PreparedRun,
  preTree: Map<string, string>,
): Effect.Effect<void, never, FileSystem> {
  return Effect.gen(function* () {
  const postTree = yield* snapshotTreeEffect(run.worldPath);
  for (const event of diffTrees(preTree, postTree)) {
    run.evidenceCollector.addFileWrite(event);
  }
  });
}

async function persistMetadata(input: {
  run: PreparedRun;
  fixture: string;
  vars: Record<string, unknown>;
  output: string;
  preconditionResults: AgentSkillEvalsAssertionResult[];
  preconditionsPassed: boolean;
  startedAt: number;
}): Promise<AgentSkillEvalsProviderMetadata> {
  return Effect.runPromise(
    persistMetadataEffect(input).pipe(Effect.provide(NodeServicesLive)),
  );
}

function persistMetadataEffect(input: {
  run: PreparedRun;
  fixture: string;
  vars: Record<string, unknown>;
  output: string;
  preconditionResults: AgentSkillEvalsAssertionResult[];
  preconditionsPassed: boolean;
  startedAt: number;
}): Effect.Effect<AgentSkillEvalsProviderMetadata, unknown, FileSystem> {
  return Effect.gen(function* () {
  const fs = yield* FileSystem;
  const now = yield* Clock.currentTimeMillis;
  const durationMs = now - input.startedAt;
  input.run.evidenceCollector.setOutput(input.output);
  input.run.evidenceCollector.setRun({
    runDir: input.run.runDir,
    worldPath: input.run.worldPath,
    fixture: input.fixture,
    durationMs,
  });
  const evidencePath = yield* writeEvidenceToEffect(input.run.evidenceCollector, input.run.runDir);
  const metadata: AgentSkillEvalsProviderMetadata = {
    runDir: input.run.runDir,
    worldPath: input.run.worldPath,
    evidencePath,
    fixture: input.fixture,
    skill: input.vars.skill as string | undefined,
    kind: input.vars.kind as string | undefined,
    preconditionResults: input.preconditionResults,
    preconditionsPassed: input.preconditionsPassed,
    durationMs,
  };

  yield* fs.writeText(
    join(input.run.runDir, "agent-skill-evals-meta.json"),
    JSON.stringify(metadata, null, 2),
  );
  return metadata;
  });
}

class AgentSkillEvalsProvider {
  config: ProviderConfig;
  private readonly configError?: string;
  id: () => string;

  constructor(options: { config?: ProviderConfig; id?: string } = {}) {
    const config = decodeProviderConfig(options.config ?? {});
    if ("error" in config) {
      this.config = {};
      this.configError = config.error;
    } else {
      this.config = config;
    }
    const label = options.id ?? "agent-skill-evals";
    this.id = () => label;
  }

  async callApi(
    prompt: string,
    context: PromptfooContext = {},
  ): Promise<ProviderResponse> {
    return Effect.runPromise(
      this.callApiEffect(prompt, context).pipe(Effect.provide(AgentLiveLayer)),
    );
  }

  private callApiEffect(
    prompt: string,
    context: PromptfooContext = {},
  ): Effect.Effect<ProviderResponse, never, AgentRequirements> {
    const self = this;
    return Effect.gen(function* () {
    if (self.configError) {
      return { output: "", error: self.configError };
    }
    const startedAt = yield* Clock.currentTimeMillis;
    const vars = varsFromContext(context);
    const fixture = vars.fixture as string | undefined;
    if (!fixture) {
      return {
        output: "",
        error: "agent-skill-evals-provider: vars.fixture is required. Set vars.fixture to the fixture directory for this test case.",
      };
    }

    const prepared = yield* prepareRunEffect(fixture, self.config);
    if ("error" in prepared) {
      return { output: "", error: prepared.error };
    }

    const preconditions = yield* runPreconditionsEffect(vars, prepared);
    const preTree = yield* snapshotTreeEffect(prepared.worldPath);

    let output = "";
    let error: string | undefined;
    if (preconditions.passed) {
      addNativeSkillEvidenceFromConfig(prepared, self.config, startedAt);
      const result = yield* runConfiguredAdapterEffect({
          prompt,
          run: prepared,
          config: self.config,
        });
      output = result.output;
      error = result.error;
    }
    yield* collectFileEvidenceEffect(prepared, preTree);

    const metadata = yield* persistMetadataEffect({
      run: prepared,
      fixture,
      vars,
      output,
      preconditionResults: preconditions.results,
      preconditionsPassed: preconditions.passed,
      startedAt,
    }).pipe(Effect.orDie);

    const usage = promptfooTokenUsage(prepared.evidenceCollector.toSnapshot().usage);
    return {
      output,
      ...(error ? { error } : {}),
      metadata: metadata as unknown as Record<string, unknown>,
      ...(usage ? { tokenUsage: usage } : {}),
    };
    });
  }
}

// Promptfoo loads the default export from the local shim. The named export is
// useful for tests and direct programmatic use.
export default AgentSkillEvalsProvider;
export { AgentSkillEvalsProvider };

export {
  EvidenceCollector,
  evidenceFromSnapshot,
  type EvidenceSnapshot,
} from "./evidence.js";
