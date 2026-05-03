import {
  aggregate,
  loadEvidence,
  loadMetadata,
  loadWorld,
  normaliseEntries,
  runEntries,
  type GradingResult,
  type PromptfooAssertContext,
} from "./_shared.js";

/**
 * `should` assertion. Reads `vars.should` and runs each entry through the
 * verifier registry in `should` mode. Hard-gate: any entry failing fails
 * the assertion.
 */
export default async function should(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = await loadMetadata(context);
  if (!meta) {
    return {
      pass: false,
      score: 0,
      reason: "should: provider metadata missing",
    };
  }
  const vars = (context.vars ?? context.test?.vars ?? {}) as Record<string, unknown>;
  const entries = normaliseEntries(vars.should);
  const world = loadWorld(meta);
  const evidence = await loadEvidence(meta);
  const results = await runEntries(entries, world, evidence, "should");
  return aggregate(results, "should: no checks declared");
}
