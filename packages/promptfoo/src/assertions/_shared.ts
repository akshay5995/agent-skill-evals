import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { AssertionEntry } from "../assertion-entries.js";
import type {
  AssertionMode,
  AgentSkillEvalsAssertionResult,
  WorldHandle,
} from "../internal-types.js";
import { decodeEvidenceSnapshot } from "../evidence-schema.js";
import {
  EvidenceCollector,
  evidenceFromSnapshot,
  type AgentSkillEvalsProviderMetadata,
} from "../agent/index.js";
import { makeWorldHandle } from "../agent/world.js";
import { RUNTIME_CHECKS_BY_TYPE } from "../runtime-checks/catalog.js";

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
  test?: {
    vars?: Record<string, unknown>;
    assert?: Array<{ type?: string; metric?: string; value?: unknown; config?: unknown }>;
  };
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
  const direct = context.providerResponse?.metadata;
  if (direct && typeof direct === "object" && "worldPath" in direct) {
    return direct as AgentSkillEvalsProviderMetadata;
  }
  // Fallback: AGENT_SKILL_EVALS_RUN_DIR env points at the most recent run.
  const runDir = process.env.AGENT_SKILL_EVALS_RUN_DIR;
  if (runDir) {
    try {
      const buf = await readFile(join(runDir, "agent-skill-evals-meta.json"), "utf8");
      return JSON.parse(buf) as AgentSkillEvalsProviderMetadata;
    } catch {
      return null;
    }
  }
  return null;
}

export async function loadEvidence(
  meta: AgentSkillEvalsProviderMetadata,
): Promise<EvidenceCollector> {
  let buf: string;
  try {
    buf = await readFile(meta.evidencePath, "utf8");
  } catch (err) {
    throw new Error(
      `evidence: failed to read ${meta.evidencePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf) as unknown;
  } catch (err) {
    throw new Error(
      `evidence: invalid JSON in ${meta.evidencePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const decoded = decodeEvidenceSnapshot(parsed);
  if (!decoded.ok) {
    // decodeEvidenceSnapshot already produces a user-facing message.
    throw new Error(`evidence: ${decoded.error.message}`);
  }
  return EvidenceCollector.fromSnapshot(decoded.value);
}

export function loadWorld(
  meta: AgentSkillEvalsProviderMetadata,
  evidenceCollector: EvidenceCollector,
): WorldHandle {
  const world = makeWorldHandle(meta.worldPath, (event) => evidenceCollector.addCommand(event));
  if (!meta.mockEnv) return world;
  return {
    ...world,
    exec(command, args, opts = {}) {
      return world.exec(command, args, { ...opts, env: { ...meta.mockEnv, ...(opts.env ?? {}) } });
    },
  };
}

export async function runEntries(
  entries: AssertionEntry[],
  world: WorldHandle,
  evidenceCollector: EvidenceCollector,
  mode: AssertionMode,
): Promise<AgentSkillEvalsAssertionResult[]> {
  const results: AgentSkillEvalsAssertionResult[] = [];
  for (const entry of entries) {
    const plugin = RUNTIME_CHECKS_BY_TYPE.get(entry.type);
    if (!plugin) {
      results.push({
        pass: false,
        score: 0,
        reason: `unknown effect type: ${entry.type}`,
      });
      continue;
    }
    const r = await plugin.verify({
      assertion: entry.args,
      world,
      evidence: evidenceFromSnapshot(evidenceCollector.toSnapshot()),
      mode,
    });
    results.push(r);
  }
  return results;
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
