import { fail, getStaticMeta, pass, type GradingResult, type PromptfooAssertContext } from "./_shared.js";

/**
 * SPEC §7.6 — risky skills (those whose test pack uses any risky effect)
 * must include at least one negative test.
 *
 * `vars.riskyEffects` overrides the default risky-effect list.
 */
const DEFAULT_RISKY_EFFECTS = [
  "vcs.pull_request_created",
  "mcp.tool_called",
  "git.push_to_branch",
  "network.external_call",
  "secret.read",
];

export default async function negativeCoverage(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = getStaticMeta(context);
  if (!meta) return fail("negative-coverage: provider metadata missing");
  const tests = meta.tests;
  if (!tests) return fail("negative-coverage: tests not parsed");

  const vars = (context.vars ?? context.test?.vars ?? {}) as Record<string, unknown>;
  const risky = new Set<string>(
    Array.isArray(vars.riskyEffects)
      ? (vars.riskyEffects as unknown[]).filter((x): x is string => typeof x === "string")
      : DEFAULT_RISKY_EFFECTS,
  );

  const usesRisky = tests.tests.some((t) => t.effectTypes.some((e) => risky.has(e)));
  if (!usesRisky) {
    return pass("negative-coverage: no risky effects, negative test not required");
  }

  const negatives = tests.tests.filter((t) => t.isNegative);
  if (negatives.length === 0) {
    return fail(
      `negative-coverage: skill uses risky effects (${[...risky].join(", ")}) but no negative test (kind: negative) is declared`,
    );
  }
  return pass(`negative-coverage: ${negatives.length} negative test(s)`);
}
