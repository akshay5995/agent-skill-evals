export function matchesSubset(actual: unknown, expected: unknown): boolean {
  if (expected === actual) return true;
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((item, i) => matchesSubset(actual[i], item))
    );
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
    const actualRecord = actual as Record<string, unknown>;
    return Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
      matchesSubset(actualRecord[key], value),
    );
  }
  return false;
}
