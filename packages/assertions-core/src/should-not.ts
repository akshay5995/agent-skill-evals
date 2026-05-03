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
 * `should_not` assertion. Reads `vars.should_not` and runs each entry through
 * the verifier registry in `should_not` mode. A pass means the forbidden
 * effect was NOT observed.
 */
export default async function shouldNot(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = await loadMetadata(context);
  if (!meta) {
    return {
      pass: false,
      score: 0,
      reason: "should_not: provider metadata missing",
    };
  }
  const vars = (context.vars ?? context.test?.vars ?? {}) as Record<string, unknown>;
  const entries = normaliseEntries(vars.should_not);
  const world = loadWorld(meta);
  const evidence = await loadEvidence(meta);
  const results = await runEntries(entries, world, evidence, "should_not");
  return aggregate(results, "should_not: no checks declared");
}
