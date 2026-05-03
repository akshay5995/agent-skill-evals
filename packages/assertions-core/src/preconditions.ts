import {
  aggregate,
  loadMetadata,
  type GradingResult,
  type PromptfooAssertContext,
} from "./_shared.js";

/**
 * `preconditions` assertion. The provider runs preconditions before the agent
 * and persists their results into provider metadata. This assertion just
 * surfaces those results to Promptfoo so a precondition failure becomes a
 * test failure (not a silent skip).
 */
export default async function preconditions(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = await loadMetadata(context);
  if (!meta) {
    return {
      pass: false,
      score: 0,
      reason: "preconditions: provider metadata missing (provider not @skillkit/promptfoo-provider-agent?)",
    };
  }
  const results = meta.preconditionResults ?? [];
  return aggregate(results, "preconditions: none declared");
}
