import { writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { SkillKitAssertionResult } from "@skillkit/core";
import { coreRegistry } from "@skillkit/verifiers-core";
import { adapterRegistry } from "./adapters.js";
import {
  EvidenceCollector,
  evidenceFromSnapshot,
} from "./evidence.js";
import {
  copyFixture,
  createRunDir,
  makeWorldHandle,
} from "./world.js";
import { snapshotTree, diffTrees } from "./file-watch.js";

interface ProviderConfig {
  mcp?: { recorder?: boolean };
  adapter?: string;
  command?: string;
  args?: readonly string[];
  timeoutMs?: number;
  baseDir?: string;
}

interface PromptfooContext {
  vars?: Record<string, unknown>;
  test?: { vars?: Record<string, unknown>; metadata?: Record<string, unknown> };
}

interface ProviderResponse {
  output: string;
  metadata?: Record<string, unknown>;
  cost?: number;
  tokenUsage?: { total?: number; prompt?: number; completion?: number };
  error?: string;
}

export interface SkillKitProviderMetadata {
  runDir: string;
  worldPath: string;
  evidencePath: string;
  fixture: string;
  skill?: string;
  kind?: string;
  preconditionResults: SkillKitAssertionResult[];
  preconditionsPassed: boolean;
  durationMs: number;
}

interface VerifierEntry {
  type?: string;
  [key: string]: unknown;
}

/**
 * Normalises a Promptfoo `vars.preconditions | should | should_not` array
 * into [{ type, args }] tuples. Each YAML entry looks like
 * `{ "verifier.fails": { run: "..." } }` or `"secret.read"` (no args).
 */
function normaliseEntries(
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

class SkillKitProvider {
  config: ProviderConfig;
  id: () => string;

  constructor(options: { config?: ProviderConfig; id?: string } = {}) {
    this.config = options.config ?? {};
    const label = options.id ?? "skillkit";
    this.id = () => label;
  }

  async callApi(
    prompt: string,
    context: PromptfooContext = {},
  ): Promise<ProviderResponse> {
    const startedAt = Date.now();
    const vars = (context.vars ?? context.test?.vars ?? {}) as Record<
      string,
      unknown
    >;
    const fixture = vars.fixture as string | undefined;
    if (!fixture) {
      return {
        output: "",
        error: "skillkit-provider: vars.fixture is required",
      };
    }

    const { runDir, worldPath } = await createRunDir();
    await copyFixture(
      { fixturePath: fixture, baseDir: this.config.baseDir },
      worldPath,
    );

    const world = makeWorldHandle(worldPath);
    const evidenceCollector = new EvidenceCollector();

    // Run preconditions BEFORE the agent.
    const precondResults: SkillKitAssertionResult[] = [];
    let preconditionsPassed = true;
    for (const entry of normaliseEntries(vars.preconditions)) {
      const plugin = coreRegistry.get(entry.type);
      if (!plugin) {
        precondResults.push({
          pass: false,
          score: 0,
          reason: `precondition: unknown type "${entry.type}"`,
        });
        preconditionsPassed = false;
        continue;
      }
      const r = await plugin.verify({
        assertion: entry.args,
        world,
        evidence: evidenceFromSnapshot(evidenceCollector.toSnapshot()),
        mode: "precondition",
      });
      precondResults.push(r);
      if (!r.pass) preconditionsPassed = false;
    }

    const preTree = await snapshotTree(worldPath);

    let output = "";
    if (preconditionsPassed) {
      const adapterId = this.config.adapter ?? "generic";
      const adapter = adapterRegistry.get(adapterId);
      if (!adapter) {
        return {
          output: "",
          error: `skillkit-provider: unknown adapter "${adapterId}"`,
          metadata: { runDir, worldPath },
        };
      }
      if (!this.config.command) {
        return {
          output: "",
          error: "skillkit-provider: config.command is required",
          metadata: { runDir, worldPath },
        };
      }
      const baseDir = this.config.baseDir ?? process.cwd();
      const resolvePath = (p: string): string =>
        p.startsWith("./") || p.startsWith("../") || (!isAbsolute(p) && p.includes("/"))
          ? resolve(baseDir, p)
          : p;
      const result = await adapter.run({
        command: resolvePath(this.config.command),
        args: (this.config.args ?? []).map((a) =>
          typeof a === "string" ? resolvePath(a) : a,
        ),
        cwd: worldPath,
        prompt,
        evidence: evidenceCollector,
        timeoutMs: this.config.timeoutMs ?? 5 * 60_000,
      });
      output = result.output;
    }

    if (this.config.mcp?.recorder && Array.isArray(vars.mcp_calls)) {
      for (const call of vars.mcp_calls as Array<Record<string, unknown>>) {
        evidenceCollector.addMcpCall({
          timestamp: Date.now(),
          server: String(call.server ?? "unknown"),
          tool: String(call.tool ?? "unknown"),
          args: call.args,
          result: call.result,
          error: typeof call.error === "string" ? call.error : undefined,
        });
      }
    }

    const postTree = await snapshotTree(worldPath);
    for (const ev of diffTrees(preTree, postTree)) {
      evidenceCollector.addFileWrite(ev);
    }

    const evidencePath = await evidenceCollector.writeTo(runDir);
    const metadata: SkillKitProviderMetadata = {
      runDir,
      worldPath,
      evidencePath,
      fixture,
      skill: vars.skill as string | undefined,
      kind: vars.kind as string | undefined,
      preconditionResults: precondResults,
      preconditionsPassed,
      durationMs: Date.now() - startedAt,
    };

    // Persist metadata next to evidence so assertions that don't receive
    // providerResponse on context can still find it.
    await writeFile(
      join(runDir, "skillkit-meta.json"),
      JSON.stringify(metadata, null, 2),
    );

    return {
      output,
      metadata: metadata as unknown as Record<string, unknown>,
      tokenUsage: {
        total: evidenceCollector.toSnapshot().usage.totalTokens,
      },
    };
  }
}

// Promptfoo expects a default export that is callable as a constructor or a
// factory. We expose both shapes for compatibility.
export default SkillKitProvider;
export { SkillKitProvider };

// Re-exports used by @skillkit/assertions-core to rebuild WorldHandle and
// EvidenceHandle from persisted state.
export { makeWorldHandle } from "./world.js";
export {
  EvidenceCollector,
  evidenceFromSnapshot,
  type EvidenceSnapshot,
} from "./evidence.js";
