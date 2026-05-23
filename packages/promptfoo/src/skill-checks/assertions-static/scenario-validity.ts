import { fail, getStaticMeta, pass, type GradingResult, type PromptfooAssertContext } from "./_shared.js";
import { skillCheckSettings } from "./settings.js";

/**
 * SPEC §7.6 — every runtime test must have prompt + fixture (or fixtureless)
 * + at least one of should/should_not. Unsupported effect types fail
 * static validation.
 */
export default async function scenarioValidity(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = getStaticMeta(context);
  if (!meta) return fail("skill.tests: provider metadata missing");
  const tests = meta.tests;
  if (!tests) return fail("skill.tests: tests not parsed (vars.testsGlob missing?)");
  const settings = skillCheckSettings(context);

  const components: GradingResult["componentResults"] = [];

  if (tests.parseErrors.length > 0) {
    components.push({
      pass: false,
      score: 0,
      reason: `parse errors: ${tests.parseErrors.map((e) => `${e.filePath}: ${e.error}`).join("; ")}`,
    });
  }

  if (tests.matchedFiles.length === 0) {
    components.push({
      pass: false,
      score: 0,
      reason: "testsGlob matched no test files",
    });
  }

  for (const t of tests.tests) {
    const issues: string[] = [];
    for (const error of t.entryErrors) {
      const at = error.index === undefined ? error.field : `${error.field}[${error.index}]`;
      issues.push(`${at}: ${error.reason}`);
    }
    if (typeof t.vars.prompt !== "string" || t.vars.prompt.length === 0) {
      issues.push("missing vars.prompt");
    }
    if (!t.hasFixture) {
      issues.push("missing vars.fixture (or vars.fixtureless: true)");
    }
    const hasCheck =
      (Array.isArray(t.vars.should) && t.vars.should.length > 0) ||
      (Array.isArray(t.vars.should_not) && t.vars.should_not.length > 0);
    if (!hasCheck) issues.push("no should / should_not");
    if (settings.requireTokenBudget && !t.hasTokenBudget) {
      issues.push("missing skill.budget assertion");
    }
    components.push({
      pass: issues.length === 0,
      score: issues.length === 0 ? 1 : 0,
      reason: `${t.description ?? "(no description)"}: ${issues.length === 0 ? "ok" : issues.join(", ")}`,
    });
  }

  if (meta.unresolvedEffectTypes.length > 0) {
    components.push({
      pass: false,
      score: 0,
      reason: `unsupported effect types: ${meta.unresolvedEffectTypes.join(", ")}`,
    });
  }

  if (meta.missingFiles.length > 0) {
    components.push({
      pass: false,
      score: 0,
      reason: `missing referenced files: ${meta.missingFiles.slice(0, 5).join(", ")}`,
    });
  }

  const failed = components.filter((c) => !c.pass);
  if (failed.length === 0) {
    return pass(`skill.tests: ${tests.tests.length} test(s) ok`, components);
  }
  return fail(
    failed.map((f) => `✗ ${f.reason}`).join("; "),
    components,
  );
}
