import { fail, getStaticMeta, pass, type GradingResult, type PromptfooAssertContext } from "./_shared.js";

/**
 * SPEC §7.3 — for skills whose test pack uses destructive effects, the
 * SKILL.md must contain confirmation/clarification language and at least
 * one negative test must declare forbidden effects.
 *
 * `vars.destructiveEffects` overrides the default destructive-effect list.
 */
const DEFAULT_DESTRUCTIVE = [
  "git.push_to_branch",
  "vcs.pull_request_created",
  "mcp.tool_called",
];

const CONFIRMATION_RE =
  /\b(confirm|ask first|do not.*without|before.*push|require.*approval|do not.*destructive)\b/i;
const PLAN_BEFORE_ACT_RE =
  /\b(plan first|plan before|read.*before.*write|validate.*before|dry.run)\b/i;

export default async function instructionCalibration(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = getStaticMeta(context);
  if (!meta) return fail("instruction-calibration: provider metadata missing");
  const skill = meta.skill;
  const tests = meta.tests;
  if (!skill) return fail("instruction-calibration: skill not parsed");

  const vars = (context.vars ?? context.test?.vars ?? {}) as Record<string, unknown>;
  const destructive = new Set<string>(
    Array.isArray(vars.destructiveEffects)
      ? (vars.destructiveEffects as unknown[]).filter((x): x is string => typeof x === "string")
      : DEFAULT_DESTRUCTIVE,
  );

  const usesDestructive = tests
    ? tests.tests.some((t) => t.effectTypes.some((e) => destructive.has(e)))
    : false;

  if (!usesDestructive) {
    return pass("instruction-calibration: no destructive effects in test pack");
  }

  const components: GradingResult["componentResults"] = [];
  const hasConfirm = CONFIRMATION_RE.test(skill.body) || PLAN_BEFORE_ACT_RE.test(skill.body);
  components.push({
    pass: hasConfirm,
    score: hasConfirm ? 1 : 0,
    reason: hasConfirm
      ? "SKILL.md describes confirmation / plan-before-act"
      : "SKILL.md uses destructive effects but lacks confirmation / plan-before-act language",
  });

  const declaresForbidden = tests
    ? tests.tests.some((t) => Array.isArray(t.vars.should_not) && t.vars.should_not.length > 0)
    : false;
  components.push({
    pass: declaresForbidden,
    score: declaresForbidden ? 1 : 0,
    reason: declaresForbidden
      ? "test pack declares forbidden effects (should_not)"
      : "no should_not declared in any test, despite destructive effects",
  });

  const failed = components.filter((c) => !c.pass);
  if (failed.length === 0) return pass("instruction-calibration: ok", components);
  return fail(failed.map((f) => `✗ ${f.reason}`).join("; "), components);
}
