export interface AssertionEntry {
  type: string;
  args: unknown;
}

export interface AssertionEntryError {
  field: string;
  index?: number;
  reason: string;
}

export interface ParsedAssertionEntries {
  entries: AssertionEntry[];
  errors: AssertionEntryError[];
}

export interface RuntimeTestFieldEntries {
  preconditions: AssertionEntry[];
  expect: AssertionEntry[];
  errors: AssertionEntryError[];
}

function isEntryObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalizes generated Promptfoo `vars.preconditions | expect` entries.
 *
 * Supports the clean Test Pack shorthand form:
 * `{ "file.exists": { path: "app.js" } }`
 */
export function parseRuntimeTestFields(
  vars: Record<string, unknown>,
): RuntimeTestFieldEntries {
  const preconditions = parseAssertionEntries(vars.preconditions, "preconditions", {
    allowMissing: true,
  });
  const expect = parseAssertionEntries(vars.expect, "expect", {
    allowMissing: true,
  });
  return {
    preconditions: preconditions.entries,
    expect: expect.entries,
    errors: [...preconditions.errors, ...expect.errors],
  };
}

export function parseAssertionEntries(
  raw: unknown,
  field: string,
  options: { allowMissing?: boolean } = {},
): ParsedAssertionEntries {
  const entries: AssertionEntry[] = [];
  const errors: AssertionEntryError[] = [];

  if (raw === undefined || raw === null) {
    if (!options.allowMissing) {
      errors.push({ field, reason: "must be an array of assertion entries" });
    }
    return { entries, errors };
  }

  if (!Array.isArray(raw)) {
    return {
      entries,
      errors: [{ field, reason: "must be an array of assertion entries" }],
    };
  }

  raw.forEach((entry, index) => {
    const parsed = parseAssertionEntry(entry, field, index);
    if ("error" in parsed) {
      errors.push(parsed.error);
    } else {
      entries.push(parsed.entry);
    }
  });

  return { entries, errors };
}

function parseAssertionEntry(
  entry: unknown,
  field: string,
  index: number,
): { entry: AssertionEntry } | { error: AssertionEntryError } {
  if (!isEntryObject(entry)) {
    return {
      error: {
        field,
        index,
        reason: "entry must be a shorthand assertion object",
      },
    };
  }

  const keys = Object.keys(entry);
  if (keys.length !== 1) {
    return {
      error: {
        field,
        index,
        reason: "shorthand assertion object must have exactly one key",
      },
    };
  }

  const type = keys[0]!;
  const args = entry[type];
  if (!isEntryObject(args)) {
    return {
      error: {
        field,
        index,
        reason: `shorthand assertion "${type}" value must be an object`,
      },
    };
  }
  return { entry: { type, args } };
}
