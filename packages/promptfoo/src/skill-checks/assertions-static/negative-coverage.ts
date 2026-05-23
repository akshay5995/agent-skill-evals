import { fail, getStaticMeta, pass, type GradingResult, type PromptfooAssertContext } from "./_shared.js";
import { skillCheckSettings } from "./settings.js";

/**
 * SPEC §7.6 — risky skills (those whose test pack uses any risky effect)
 * must include at least one negative test.
 *
 * `assert.config.agentSkillEvals.riskyEffects` overrides the default risky-effect list.
 */
export default async function negativeCoverage(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = getStaticMeta(context);
  if (!meta) return fail("skill.tests: provider metadata missing");
  const tests = meta.tests;
  if (!tests) return fail("skill.tests: tests not parsed");

  const risky = new Set<string>(skillCheckSettings(context).riskyEffects);

  const usesRisky = tests.tests.some((t) => t.effectTypes.some((e) => risky.has(e)));
  if (!usesRisky) {
    return pass("skill.tests: no risky effects, negative test not required");
  }

  const negatives = tests.tests.filter((t) => t.isNegative);
  if (negatives.length === 0) {
    return fail(
      `skill.tests: skill uses risky effects (${[...risky].join(", ")}) but no negative test (kind: negative) is declared`,
    );
  }
  return pass(`skill.tests: ${negatives.length} negative test(s)`);
}
