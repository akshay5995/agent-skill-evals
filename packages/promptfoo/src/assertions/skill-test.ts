import {
  aggregate,
  loadEvidence,
  loadMetadata,
  loadWorld,
  runEntries,
  type GradingResult,
  type PromptfooAssertContext,
} from "./_shared.js";
import { parseRuntimeTestFields } from "../assertion-entries.js";
import { writeEvidenceTo } from "../agent/evidence.js";
import { assertMockServicesHealthy, stopMockServices } from "../agent/mock-services.js";

function withEvidencePointer(
  result: GradingResult,
  meta: { evidencePath: string; worldPath: string },
): GradingResult {
  if (result.pass) return result;
  return {
    ...result,
    reason: `${result.reason}\nEvidence: ${meta.evidencePath}\nWorld: ${meta.worldPath}`,
  };
}

export default async function skillTest(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = await loadMetadata(context);
  if (!meta) {
    return {
      pass: false,
      score: 0,
      reason: "skill.test: provider metadata missing",
    };
  }

  const preconditionResults = meta.preconditionResults ?? [];
  if (!meta.preconditionsPassed) {
    const result = withEvidencePointer(
      aggregate(preconditionResults, "skill.test: preconditions failed"),
      meta,
    );
    await stopMockServices(meta.runDir);
    return result;
  }

  const vars = (context.vars ?? context.test?.vars ?? {}) as Record<string, unknown>;
  let evidenceCollector;
  try {
    evidenceCollector = await loadEvidence(meta);
  } catch (err) {
    await stopMockServices(meta.runDir);
    return { pass: false, score: 0, reason: err instanceof Error ? err.message : String(err) };
  }
  try {
    assertMockServicesHealthy(meta.runDir);
  } catch (err) {
    await stopMockServices(meta.runDir);
    return withEvidencePointer({ pass: false, score: 0, reason: `Mock Service failure: ${err instanceof Error ? err.message : String(err)}` }, meta);
  }
  const world = loadWorld(meta, evidenceCollector);
  const warningResults = evidenceCollector.toSnapshot().warnings?.map((warning) => ({
    pass: false,
    score: 0,
    reason: `evidence warning: ${warning}`,
  })) ?? [];

  const parsed = parseRuntimeTestFields(vars);
  const parseResults = parsed.errors
    .filter((error) => error.field !== "preconditions")
    .map((error) => ({
      pass: false,
      score: 0,
      reason: `runtime test field ${error.index === undefined ? error.field : `${error.field}[${error.index}]`}: ${error.reason}`,
    }));
  const expectationResults = await runEntries(parsed.expect, world, evidenceCollector, "should");
  // Persisting verifier evidence back to disk is best effort: a write
  // failure must not discard the check results already computed.
  let writeError: string | undefined;
  try {
    await writeEvidenceTo(evidenceCollector, meta.runDir);
  } catch (err) {
    writeError = err instanceof Error ? err.message : String(err);
  }
  const results = [
    ...preconditionResults,
    ...warningResults,
    ...parseResults,
    ...expectationResults,
  ];
  const graded = withEvidencePointer(
    aggregate(results, "skill.test: no Runtime Test Fields checks declared", {
      emptyPass: false,
    }),
    meta,
  );
  if (writeError !== undefined) {
    await stopMockServices(meta.runDir);
    return { ...graded, reason: `${graded.reason}\n(note: failed to update evidence.json: ${writeError})` };
  }
  await stopMockServices(meta.runDir);
  return graded;
}
