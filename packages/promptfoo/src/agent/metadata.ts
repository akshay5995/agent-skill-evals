import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { AgentSkillEvalsAssertionResult } from "../internal-types.js";
import type { RuntimeIdentity } from "../evidence-schema.js";
import { writeEvidenceTo } from "./evidence.js";
import type { PreparedRun } from "./index.js";

export interface AgentSkillEvalsProviderMetadata {
  runDir: string;
  worldPath: string;
  evidencePath: string;
  fixture?: string;
  skill?: string;
  kind?: string;
  preconditionResults: AgentSkillEvalsAssertionResult[];
  preconditionsPassed: boolean;
  durationMs: number;
  runtime?: RuntimeIdentity;
  warnings?: string[];
  mockEnv?: Record<string, string>;
}

export async function persistMetadata(input: {
  run: PreparedRun;
  fixture?: string;
  vars: Record<string, unknown>;
  output: string;
  preconditionResults: AgentSkillEvalsAssertionResult[];
  preconditionsPassed: boolean;
  startedAt: number;
  mockEnv?: Record<string, string>;
}): Promise<AgentSkillEvalsProviderMetadata> {
  const durationMs = Date.now() - input.startedAt;
  input.run.evidenceCollector.setOutput(input.output);
  input.run.evidenceCollector.setRun({
    runDir: input.run.runDir,
    worldPath: input.run.worldPath,
    ...(input.fixture ? { fixture: input.fixture } : {}),
    durationMs,
    ...(input.mockEnv && Object.keys(input.mockEnv).length > 0 ? { mockEnv: input.mockEnv } : {}),
  });
  const evidencePath = await writeEvidenceTo(input.run.evidenceCollector, input.run.runDir);
  const snapshot = input.run.evidenceCollector.toSnapshot();
  const metadata: AgentSkillEvalsProviderMetadata = {
    runDir: input.run.runDir,
    worldPath: input.run.worldPath,
    evidencePath,
    ...(input.fixture ? { fixture: input.fixture } : {}),
    skill: input.vars.skill as string | undefined,
    kind: input.vars.kind as string | undefined,
    preconditionResults: input.preconditionResults,
    preconditionsPassed: input.preconditionsPassed,
    durationMs,
    ...(snapshot.runtime ? { runtime: snapshot.runtime } : {}),
    ...(snapshot.warnings && snapshot.warnings.length > 0 ? { warnings: snapshot.warnings } : {}),
  };

  await writeFile(
    join(input.run.runDir, "agent-skill-evals-meta.json"),
    JSON.stringify(metadata, null, 2),
  );
  return metadata;
}
