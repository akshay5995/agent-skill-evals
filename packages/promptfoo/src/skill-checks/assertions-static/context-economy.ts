import { fail, getStaticMeta, pass, type GradingResult, type PromptfooAssertContext } from "./_shared.js";
import { skillCheckSettings } from "./settings.js";

/**
 * SPEC §7.2 — context economy. Hard: referenced files must exist (already
 * surfaced via missingFiles). Warnings: SKILL.md size, reference depth,
 * missing TOC in long reference files.
 *
 * Implemented as warnings-only: this assertion always passes, but emits a
 * `score < 1` reason describing how SKILL.md compares to thresholds.
 */
export default async function contextEconomy(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = getStaticMeta(context);
  if (!meta) return fail("context-economy: provider metadata missing");
  const skill = meta.skill;
  if (!skill) return fail("context-economy: skill not parsed");

  const { maxSkillLines: maxLines } = skillCheckSettings(context);

  const components: GradingResult["componentResults"] = [];

  components.push({
    pass: skill.totalLines <= maxLines,
    score: skill.totalLines <= maxLines ? 1 : 0.5,
    reason: `SKILL.md ${skill.totalLines} line(s) (limit ${maxLines})`,
  });

  components.push({
    pass: skill.missingReferences.length === 0,
    score: skill.missingReferences.length === 0 ? 1 : 0,
    reason:
      skill.missingReferences.length === 0
        ? `${skill.references.length} reference(s) all resolved`
        : `missing references: ${skill.missingReferences.slice(0, 3).join(", ")}`,
  });

  // Hard fail only on missing references; soft on size.
  const failed = components.filter((c) => !c.pass && c.reason.startsWith("missing references"));
  if (failed.length === 0) {
    const oversize = components.find((c) => c.score < 1);
    return oversize
      ? { pass: true, score: 0.5, reason: oversize.reason, componentResults: components }
      : pass(`context-economy: ok`, components);
  }
  return fail(failed.map((f) => `✗ ${f.reason}`).join("; "), components);
}
