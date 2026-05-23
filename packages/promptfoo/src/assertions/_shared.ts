import { join } from "node:path";
import * as Either from "effect/Either";
import * as Effect from "effect/Effect";
import type { AssertionEntry } from "../assertion-entries.js";
import type {
  AssertionMode,
  EvidenceHandle,
  AgentSkillEvalsAssertionResult,
  WorldHandle,
} from "../internal-types.js";
import { decodeEvidenceSnapshotEither } from "../evidence-schema.js";
import {
  EvidenceCollector,
  evidenceFromSnapshot,
  type AgentSkillEvalsProviderMetadata,
} from "../agent/index.js";
import { makeWorldHandle } from "../agent/world.js";
import {
  getRuntimeCheck,
  RuntimeCheckCatalog,
  RuntimeCheckCatalogLive,
} from "../runtime-checks/catalog.js";
import {
  Environment,
  FileSystem,
  NodeServicesLive,
} from "../internal-services.js";

export interface PromptfooAssertContext {
  vars?: Record<string, unknown>;
  providerResponse?: {
    metadata?: unknown;
    tokenUsage?: {
      total?: number;
      prompt?: number;
      completion?: number;
      cached?: number;
    };
  };
  test?: { vars?: Record<string, unknown> };
  assertion?: { metric?: string };
  assert?: { metric?: string };
  config?: { metric?: string; agentSkillEvals?: unknown };
  metric?: string;
}

export interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
  componentResults?: Array<{ pass: boolean; score: number; reason: string }>;
  metadata?: Record<string, unknown>;
}

export async function loadMetadata(
  context: PromptfooAssertContext,
): Promise<AgentSkillEvalsProviderMetadata | null> {
  return Effect.runPromise(loadMetadataEffect(context).pipe(Effect.provide(NodeServicesLive)));
}

export function loadMetadataEffect(
  context: PromptfooAssertContext,
): Effect.Effect<AgentSkillEvalsProviderMetadata | null, never, FileSystem | Environment> {
  return Effect.gen(function* () {
  const direct = context.providerResponse?.metadata;
  if (direct && typeof direct === "object" && "worldPath" in direct) {
    return direct as AgentSkillEvalsProviderMetadata;
  }
  // Fallback: AGENT_SKILL_EVALS_RUN_DIR env points at the most recent run.
  const environment = yield* Environment;
  const env = yield* environment.env;
  const runDir = env.AGENT_SKILL_EVALS_RUN_DIR;
  if (runDir) {
    const fs = yield* FileSystem;
    const parsed = yield* fs.readText(join(runDir, "agent-skill-evals-meta.json")).pipe(
      Effect.map((buf) => {
        try {
          return JSON.parse(buf) as AgentSkillEvalsProviderMetadata;
        } catch {
          return null;
        }
      }),
      Effect.catchAll(() => Effect.succeed(null)),
    );
    if (parsed) {
      return parsed;
    }
  }
  return null;
  });
}

export async function loadEvidence(
  meta: AgentSkillEvalsProviderMetadata,
): Promise<EvidenceCollector> {
  return Effect.runPromise(loadEvidenceEffect(meta).pipe(Effect.provide(NodeServicesLive)));
}

export function loadEvidenceEffect(
  meta: AgentSkillEvalsProviderMetadata,
): Effect.Effect<EvidenceCollector, Error, FileSystem> {
  return Effect.gen(function* () {
  const fs = yield* FileSystem;
  const buf = yield* fs.readText(meta.evidencePath).pipe(
    Effect.mapError((err) => new Error(`evidence: failed to read ${meta.evidencePath}: ${err instanceof Error ? err.message : String(err)}`)),
  );
  const parsed = yield* Effect.try({
    try: () => JSON.parse(buf) as unknown,
    catch: (err) =>
      new Error(`evidence: invalid JSON in ${meta.evidencePath}: ${err instanceof Error ? err.message : String(err)}`),
  });
  const decoded = decodeEvidenceSnapshotEither(parsed);
  if (Either.isLeft(decoded)) {
    return yield* Effect.fail(
      new Error(`evidence: invalid agent-skill-evals.evidence.v1 payload: ${decoded.left.message}`),
    );
  }
  const snapshot = decoded.right;
  return EvidenceCollector.fromSnapshot(snapshot);
  });
}

export function loadWorld(
  meta: AgentSkillEvalsProviderMetadata,
  evidenceCollector: EvidenceCollector,
): WorldHandle {
  return makeWorldHandle(meta.worldPath, (event) => evidenceCollector.addCommand(event));
}

export async function runEntries(
  entries: AssertionEntry[],
  world: WorldHandle,
  evidenceCollector: EvidenceCollector,
  mode: AssertionMode,
): Promise<AgentSkillEvalsAssertionResult[]> {
  return Effect.runPromise(
    runEntriesEffect(entries, world, evidenceCollector, mode).pipe(
      Effect.provide(RuntimeCheckCatalogLive),
    ),
  );
}

export function runEntriesEffect(
  entries: AssertionEntry[],
  world: WorldHandle,
  evidenceCollector: EvidenceCollector,
  mode: AssertionMode,
): Effect.Effect<AgentSkillEvalsAssertionResult[], never, RuntimeCheckCatalog> {
  return Effect.gen(function* () {
  const results: AgentSkillEvalsAssertionResult[] = [];
  for (const entry of entries) {
    const plugin = yield* getRuntimeCheck(entry.type);
    if (!plugin) {
      results.push({
        pass: false,
        score: 0,
        reason: `unknown effect type: ${entry.type}`,
      });
      continue;
    }
    const r = yield* plugin.verify({
      assertion: entry.args,
      world,
      evidence: evidenceFromSnapshot(evidenceCollector.toSnapshot()),
      mode,
    });
    results.push(r);
  }
  return results;
  });
}

export function aggregate(
  results: AgentSkillEvalsAssertionResult[],
  emptyReason: string,
  options: { emptyPass?: boolean } = {},
): GradingResult {
  if (results.length === 0) {
    const pass = options.emptyPass ?? true;
    return { pass, score: pass ? 1 : 0, reason: emptyReason };
  }
  const allPass = results.every((r) => r.pass);
  const failed = results.filter((r) => !r.pass).map((r) => r.reason);
  return {
    pass: allPass,
    score: allPass ? 1 : 0,
    reason: allPass
      ? `${results.length} check(s) passed`
      : failed.join("; "),
    componentResults: results.map((r) => ({
      pass: r.pass,
      score: r.score,
      reason: r.reason,
    })),
  };
}
