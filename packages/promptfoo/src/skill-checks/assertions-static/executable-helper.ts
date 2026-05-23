import { fail, getStaticMeta, pass, type GradingResult, type PromptfooAssertContext } from "./_shared.js";

/**
 * SPEC §7.4 — verifier scripts referenced by tests must exist and be
 * runnable. Generated tests must not reference missing fixtures.
 */
export default async function executableHelper(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = getStaticMeta(context);
  if (!meta) return fail("executable-helper: provider metadata missing");
  const tests = meta.tests;
  if (!tests) return fail("executable-helper: tests not parsed");

  const components: GradingResult["componentResults"] = [];

  components.push({
    pass: tests.missingVerifierScripts.length === 0,
    score: tests.missingVerifierScripts.length === 0 ? 1 : 0,
    reason: tests.missingVerifierScripts.length === 0
      ? `${tests.verifierScripts.length} verifier script(s) all present`
      : `missing verifier scripts: ${tests.missingVerifierScripts.slice(0, 3).join(", ")}`,
  });

  components.push({
    pass: tests.nonExecutableVerifierScripts.length === 0,
    score: tests.nonExecutableVerifierScripts.length === 0 ? 1 : 0,
    reason: tests.nonExecutableVerifierScripts.length === 0
      ? `${tests.verifierScripts.length} verifier script(s) executable`
      : `non-executable verifier scripts: ${tests.nonExecutableVerifierScripts.slice(0, 3).join(", ")}`,
  });

  components.push({
    pass: tests.missingFixturePaths.length === 0,
    score: tests.missingFixturePaths.length === 0 ? 1 : 0,
    reason: tests.missingFixturePaths.length === 0
      ? `${tests.fixturePaths.length} fixture(s) all present`
      : `missing fixtures: ${tests.missingFixturePaths.slice(0, 3).join(", ")}`,
  });

  const failed = components.filter((c) => !c.pass);
  if (failed.length === 0) return pass("executable-helper: ok", components);
  return fail(failed.map((f) => `✗ ${f.reason}`).join("; "), components);
}
