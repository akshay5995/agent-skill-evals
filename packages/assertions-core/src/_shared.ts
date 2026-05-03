import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AssertionMode,
  EvidenceHandle,
  SkillKitAssertionResult,
  WorldHandle,
} from "@skillkit/core";
import {
  evidenceFromSnapshot,
  makeWorldHandle,
  type EvidenceSnapshot,
  type SkillKitProviderMetadata,
} from "@skillkit/promptfoo-provider-agent";
import { coreRegistry } from "@skillkit/verifiers-core";

export interface PromptfooAssertContext {
  vars?: Record<string, unknown>;
  providerResponse?: { metadata?: unknown };
  test?: { vars?: Record<string, unknown> };
}

export interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
  componentResults?: Array<{ pass: boolean; score: number; reason: string }>;
  metadata?: Record<string, unknown>;
}

interface VerifierEntry {
  type?: string;
  [key: string]: unknown;
}

export function normaliseEntries(
  raw: unknown,
): Array<{ type: string; args: unknown }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ type: string; args: unknown }> = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      out.push({ type: entry, args: {} });
      continue;
    }
    if (entry && typeof entry === "object") {
      const e = entry as VerifierEntry;
      if (typeof e.type === "string") {
        out.push({ type: e.type, args: e });
        continue;
      }
      const keys = Object.keys(e);
      if (keys.length === 1) {
        const type = keys[0]!;
        out.push({ type, args: e[type] ?? {} });
      }
    }
  }
  return out;
}

export async function loadMetadata(
  context: PromptfooAssertContext,
): Promise<SkillKitProviderMetadata | null> {
  const direct = context.providerResponse?.metadata;
  if (direct && typeof direct === "object" && "worldPath" in direct) {
    return direct as SkillKitProviderMetadata;
  }
  // Fallback: SKILLKIT_RUN_DIR env points at the most recent run.
  const runDir = process.env.SKILLKIT_RUN_DIR;
  if (runDir) {
    try {
      const buf = await readFile(join(runDir, "skillkit-meta.json"), "utf8");
      return JSON.parse(buf) as SkillKitProviderMetadata;
    } catch {
      return null;
    }
  }
  return null;
}

export async function loadEvidence(
  meta: SkillKitProviderMetadata,
): Promise<EvidenceHandle> {
  const buf = await readFile(meta.evidencePath, "utf8");
  const snapshot = JSON.parse(buf) as EvidenceSnapshot;
  return evidenceFromSnapshot(snapshot);
}

export function loadWorld(meta: SkillKitProviderMetadata): WorldHandle {
  return makeWorldHandle(meta.worldPath);
}

export async function runEntries(
  entries: Array<{ type: string; args: unknown }>,
  world: WorldHandle,
  evidence: EvidenceHandle,
  mode: AssertionMode,
): Promise<SkillKitAssertionResult[]> {
  const results: SkillKitAssertionResult[] = [];
  for (const entry of entries) {
    const plugin = coreRegistry.get(entry.type);
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
      evidence,
      mode,
    });
    results.push(r);
  }
  return results;
}

export function aggregate(
  results: SkillKitAssertionResult[],
  emptyReason: string,
): GradingResult {
  if (results.length === 0) {
    return { pass: true, score: 1, reason: emptyReason };
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
