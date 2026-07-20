import type { AgentSkillEvalsAssertionResult } from "../internal-types.js";
import { parseRuntimeTestFields } from "../assertion-entries.js";
import { RUNTIME_CHECKS_BY_TYPE } from "../runtime-checks/catalog.js";
import { EvidenceCollector, evidenceFromSnapshot } from "./evidence.js";
import { adapterRegistry } from "./adapters.js";
import {
  copyFixture,
  createRunDir,
  makeWorldHandle,
} from "./world.js";
import { snapshotTree, diffTrees } from "./file-watch.js";
import { presetStalenessHint, PRESET_IDS } from "./presets.js";
import { decodeConversationSpec, runConversation } from "./conversation.js";
import {
  decodeProviderConfig,
  DOCUMENTED_ADAPTERS,
  type ProviderConfig,
} from "./provider-config.js";
import { captureCliVersion, expandEnvVars, resolveConfiguredPath } from "./invocation.js";
import { makeSimulatedUserRunner } from "./simulated-user.js";
import { persistMetadata, type AgentSkillEvalsProviderMetadata } from "./metadata.js";
import { declaredSkills, prepareSkillEnvironment, skillDeliveryFromVars, type DeclaredSkill } from "./skill-environment.js";
import { resolveSkillServerEntry } from "./skill-server-entry.js";
import { startMockServices, stopMockServices } from "./mock-services.js";
import { RESERVED_SKILL_SERVER_MOCK_NAME, type MockService } from "../test-pack.js";
import { join } from "node:path";

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

export interface PreparedRun {
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

async function prepareRun(
  fixture: string | undefined,
  config: ProviderConfig,
  testPackDir?: string,
): Promise<PreparedRun | { error: string }> {
  let runDir: string;
  let worldPath: string;
  try {
    ({ runDir, worldPath } = await createRunDir());
  } catch (err) {
    return {
      error: `agent-skill-evals-provider: failed to create isolated world: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (fixture) {
    try {
      await copyFixture({ fixturePath: fixture, baseDir: testPackDir ?? config.baseDir }, worldPath);
    } catch (err) {
      return {
        error: `agent-skill-evals-provider: failed to copy fixture "${fixture}" into isolated world: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const evidenceCollector = new EvidenceCollector(config.skillEvidence);
  return {
    runDir,
    worldPath,
    evidenceCollector,
    world: makeWorldHandle(worldPath, (event) => evidenceCollector.addCommand(event)),
  };
}

async function runPreconditions(
  vars: Record<string, unknown>,
  run: PreparedRun,
): Promise<{ results: AgentSkillEvalsAssertionResult[]; passed: boolean }> {
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
    const plugin = RUNTIME_CHECKS_BY_TYPE.get(entry.type);
    if (!plugin) {
      results.push({
        pass: false,
        score: 0,
        reason: `precondition: unknown effect type "${entry.type}"`,
      });
      passed = false;
      continue;
    }
    const result = await plugin.verify({
      assertion: entry.args,
      world: run.world,
      evidence: evidenceFromSnapshot(run.evidenceCollector.toSnapshot()),
      mode: "precondition",
    });
    results.push(result);
    if (!result.pass) passed = false;
  }
  return { results, passed };
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

async function runConfiguredAdapter(input: {
  prompt: string;
  run: PreparedRun;
  authHome?: string;
  config: ProviderConfig;
  vars: Record<string, unknown>;
  runtimeEnv?: NodeJS.ProcessEnv;
  runtimeArgs?: readonly string[];
  skills?: DeclaredSkill[];
}): Promise<{ output: string; error?: string }> {
  const adapterId = input.config.adapter;
  if (!adapterId) {
    return {
      output: "",
      error: `agent-skill-evals-provider: config.adapter is required. Set a preset (${PRESET_IDS.join(", ")}) or an adapter (${DOCUMENTED_ADAPTERS.join(", ")}).`,
    };
  }
  const adapter = adapterRegistry.get(adapterId);
  if (!adapter) {
    const suggestion = DOCUMENTED_ADAPTERS.find(
      (id) => id.replace(/[^a-z]/g, "") === adapterId.toLowerCase().replace(/[^a-z]/g, ""),
    );
    return {
      output: "",
      error:
        `agent-skill-evals-provider: unknown adapter "${adapterId}".` +
        (suggestion ? ` Did you mean "${suggestion}"?` : "") +
        ` Supported adapters: ${DOCUMENTED_ADAPTERS.join(", ")}. Presets: ${PRESET_IDS.join(", ")}.`,
    };
  }
  if (!input.config.command) {
    return {
      output: "",
      error: "agent-skill-evals-provider: config.command is required for dynamic agent runs. Set a preset to get the command and flags for a supported agent.",
    };
  }
  const command = input.config.command;

  const conversation = decodeConversationSpec(input.vars.conversation);
  if (conversation && "error" in conversation) {
    return { output: "", error: `agent-skill-evals-provider: ${conversation.error}` };
  }

  const sourceEnv = { ...process.env };
  const testPackDir = typeof input.vars.testPackDir === "string" ? input.vars.testPackDir : undefined;
  const baseDir = testPackDir ?? input.config.baseDir ?? process.cwd();
  const resolvedCommand = resolveConfiguredPath(baseDir, expandEnvVars(command, sourceEnv));
  const configuredArgs = (input.config.args ?? []).map((arg) =>
    typeof arg === "string" ? resolveConfiguredPath(baseDir, expandEnvVars(arg, sourceEnv)) : arg,
  );
  const agentArgs = (input.runtimeArgs ?? input.config.args ?? []).map((arg) =>
    typeof arg === "string" ? resolveConfiguredPath(baseDir, expandEnvVars(arg, sourceEnv)) : arg,
  );
  let skillEnvironment;
  try {
    skillEnvironment = await prepareSkillEnvironment({
      runDir: input.run.runDir,
      authHome: input.authHome,
      worldPath: input.run.worldPath,
      vars: input.vars,
      baseDir,
      preset: input.config.preset,
      adapter: adapterId,
      args: agentArgs,
      prompt: input.prompt,
      evidence: input.run.evidenceCollector,
      extraEnv: input.runtimeEnv,
      ...(input.skills ? { skills: input.skills } : {}),
    });
  } catch (error) {
    return {
      output: "",
      error: `agent-skill-evals-provider: failed to prepare hermetic skills: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const env = skillEnvironment.env;
  const cliVersion = await captureCliVersion(resolvedCommand, input.run.worldPath, env);
  input.run.evidenceCollector.mergeRuntime({
    adapter: adapterId,
    ...(input.config.preset ? { preset: input.config.preset } : {}),
    command,
    ...(cliVersion ? { cliVersion } : {}),
    ...(input.config.model ? { model: input.config.model } : {}),
    ...(conversation ? { continuation: "transcript-replay" as const } : {}),
  });

  const resolvedArgs = skillEnvironment.args;
  const timeoutMs = input.config.timeoutMs ?? 5 * 60_000;
  const runAgentTurn = (prompt: string) =>
    adapter.run({
      command: resolvedCommand,
      args: resolvedArgs,
      cwd: input.run.worldPath,
      prompt: skillEnvironment.formatPrompt(prompt),
      evidence: input.run.evidenceCollector,
      timeoutMs,
      env,
    });

  if (!conversation) {
    const result = await runAgentTurn(input.prompt);
    if (result.error) {
      return {
        output: result.output,
        error: `${result.error}${presetStalenessHint(input.config.preset)}`,
      };
    }
    return { output: result.output };
  }

  const simulatedUserEnv = { ...env };
  const allowSimulatedUserMocks = Boolean(
    input.vars.conversation && typeof input.vars.conversation === "object" &&
    (input.vars.conversation as { simulatedUserAllowMocks?: boolean }).simulatedUserAllowMocks,
  );
  if (!allowSimulatedUserMocks) {
    for (const key of Object.keys(input.runtimeEnv ?? {})) {
      if (process.env[key] === undefined) delete simulatedUserEnv[key];
      else simulatedUserEnv[key] = process.env[key];
    }
  }
  const runSimulatedUser = conversation.user
    ? await makeSimulatedUserRunner({
        run: input.run,
        config: input.config,
        agent: {
          adapter,
          command: resolvedCommand,
          args: allowSimulatedUserMocks ? agentArgs : configuredArgs,
        },
        baseDir,
        env: simulatedUserEnv,
      })
    : undefined;
  if (runSimulatedUser && "error" in runSimulatedUser) {
    return { output: "", error: runSimulatedUser.error };
  }

  const result = await runConversation({
    spec: conversation,
    initialPrompt: input.prompt,
    evidence: input.run.evidenceCollector,
    runAgentTurn,
    ...(runSimulatedUser ? { runSimulatedUser: runSimulatedUser.run } : {}),
  });
  if (result.error) {
    return {
      output: result.output,
      error: `${result.error}${presetStalenessHint(input.config.preset)}`,
    };
  }
  return { output: result.output };
}

async function collectFileEvidence(
  run: PreparedRun,
  preTree: Map<string, string>,
): Promise<void> {
  const postTree = await snapshotTree(run.worldPath);
  for (const event of diffTrees(preTree, postTree)) {
    if (event.path.startsWith(".agents/skills/") || event.path.startsWith(".claude/skills/")) continue;
    run.evidenceCollector.addFileWrite(event);
  }
}

class AgentSkillEvalsProvider {
  config: ProviderConfig;
  private readonly configError?: string;
  private authHome?: string;
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
    if (this.configError) {
      return { output: "", error: this.configError };
    }
    const startedAt = Date.now();
    const vars = varsFromContext(context);
    const fixture = typeof vars.fixture === "string" ? vars.fixture : undefined;
    const testPackDir = typeof vars.testPackDir === "string" ? vars.testPackDir : undefined;
    const prepared = await prepareRun(fixture, this.config, testPackDir);
    if ("error" in prepared) {
      return { output: "", error: prepared.error };
    }
    this.authHome ??= join(prepared.runDir, "home");

    const environment = vars.environment && typeof vars.environment === "object" && !Array.isArray(vars.environment)
      ? vars.environment as { mocks?: unknown }
      : {};
    const mocks = Array.isArray(environment.mocks) ? environment.mocks as MockService[] : [];
    const mockBaseDir = testPackDir ?? this.config.baseDir ?? process.cwd();

    let skills: DeclaredSkill[] | undefined;
    let allMocks: MockService[] = mocks;
    if (skillDeliveryFromVars(vars) === "mcp") {
      if (this.config.preset === "pi" || this.config.adapter === "pi-json") {
        return {
          output: "",
          error: "agent-skill-evals-provider: skill_delivery: mcp requires the codex or claude-code preset; the Pi CLI has no built-in MCP config flag.",
        };
      }
      if (mocks.some((mock) => mock.name === RESERVED_SKILL_SERVER_MOCK_NAME)) {
        return {
          output: "",
          error: `agent-skill-evals-provider: the Mock Service name "${RESERVED_SKILL_SERVER_MOCK_NAME}" is reserved for the built-in skill server when skill_delivery is mcp.`,
        };
      }
      try {
        skills = await declaredSkills({ runDir: prepared.runDir, vars, baseDir: mockBaseDir });
        if (skills.length > 0) {
          allMocks = [...mocks, {
            name: RESERVED_SKILL_SERVER_MOCK_NAME,
            kind: "mcp",
            transport: "stdio",
            command: process.execPath,
            args: [resolveSkillServerEntry(), ...skills.map((skill) => skill.source)],
            provides_skill_evidence: true,
          }];
        }
      } catch (error) {
        return {
          output: "",
          error: `agent-skill-evals-provider: failed to prepare MCP skill delivery: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    let mockServices;
    try {
      mockServices = await startMockServices({
        mocks: allMocks,
        runDir: prepared.runDir,
        baseDir: mockBaseDir,
        preset: this.config.preset,
        baseArgs: this.config.args ?? [],
      });
    } catch (error) {
      return {
        output: "",
        error: `agent-skill-evals-provider: Mock Service setup failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    try {
    for (const command of Array.isArray(vars.setup) ? vars.setup : []) {
      if (typeof command !== "string") continue;
      const setup = await prepared.world.exec("sh", ["-lc", command], {
        timeoutMs: 60_000,
        env: Object.fromEntries(Object.entries(mockServices.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      });
      if (setup.exitCode !== 0) {
        await stopMockServices(prepared.runDir);
        return {
          output: "",
          error: `agent-skill-evals-provider: setup failed (${command}): ${setup.stderr || setup.stdout}`,
        };
      }
    }
    const preconditions = await runPreconditions(vars, prepared);
    const preTree = await snapshotTree(prepared.worldPath);

    let output = "";
    let error: string | undefined;
    if (preconditions.passed) {
      const result = await runConfiguredAdapter({
        prompt,
        run: prepared,
        authHome: this.authHome,
        config: this.config,
        vars,
        runtimeEnv: mockServices.env,
        runtimeArgs: mockServices.args,
        ...(skills ? { skills } : {}),
      });
      output = result.output;
      error = result.error;
      mockServices.assertHealthy();
    }
    await collectFileEvidence(prepared, preTree);

    // Fold persistence failures into the normal error shape like every
    // other failure path here — a full disk must not crash the eval run.
    let metadata: AgentSkillEvalsProviderMetadata;
    try {
      metadata = await persistMetadata({
        run: prepared,
        fixture,
        vars,
        output,
        preconditionResults: preconditions.results,
        preconditionsPassed: preconditions.passed,
        startedAt,
        mockEnv: Object.fromEntries(Object.entries(mockServices.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        output,
        error: `${error ? `${error}; ` : ""}agent-skill-evals-provider: failed to write run evidence/metadata: ${message}`,
      };
    }

    const usage = promptfooTokenUsage(prepared.evidenceCollector.toSnapshot().usage);
    return {
      output,
      ...(error ? { error } : {}),
      metadata: metadata as unknown as Record<string, unknown>,
      ...(usage ? { tokenUsage: usage } : {}),
    };
    } catch (caught) {
      await stopMockServices(prepared.runDir);
      return {
        output: "",
        error: `agent-skill-evals-provider: Mock Service runtime failed: ${caught instanceof Error ? caught.message : String(caught)}`,
      };
    }
  }
}

// Promptfoo loads the default export from the local shim. The named export is
// useful for tests and direct programmatic use.
export default AgentSkillEvalsProvider;
export { AgentSkillEvalsProvider };
export type { AgentSkillEvalsProviderMetadata };

export {
  EvidenceCollector,
  evidenceFromSnapshot,
  type EvidenceSnapshot,
} from "./evidence.js";
