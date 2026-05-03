// Helper for negative meta-tests: takes an assertion and returns true when
// the underlying assertion FAILS. Returns a GradingResult so the failure
// reason from the underlying check is preserved as evidence.
export function expectFail(assertion, label) {
  return async (output, context) => {
    const r = await assertion(output, context);
    return {
      pass: !r.pass,
      score: r.pass ? 0 : 1,
      reason: r.pass
        ? `${label}: expected failure, but check passed (${r.reason})`
        : `${label}: caught the expected failure (${r.reason})`,
    };
  };
}
