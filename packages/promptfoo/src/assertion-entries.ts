import * as Either from "effect/Either";
import * as Schema from "effect/Schema";
import { doubleNegativeCheckTypeSet } from "./runtime-checks/check-set.js";
import type { AssertionMode } from "./internal-types.js";

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
  should: AssertionEntry[];
  should_not: AssertionEntry[];
  errors: AssertionEntryError[];
}

interface TypedEntry {
  type?: unknown;
  [key: string]: unknown;
}

const RuntimeFieldArraySchema = Schema.Array(Schema.Unknown);
const EntryObjectSchema = Schema.Unknown.pipe(
  Schema.filter(
    (value): value is Record<string, unknown> =>
      typeof value === "object" && value !== null && !Array.isArray(value),
    { identifier: "AssertionEntryObject" },
  ),
);
const NonEmptyTypeSchema = Schema.String.pipe(
  Schema.filter((value) => value.length > 0, { identifier: "NonEmptyType" }),
);

/**
 * Normalizes Promptfoo `vars.preconditions | should | should_not` entries.
 *
 * Supported forms:
 * - `"file.exists"`
 * - `{ type: "file.exists", path: "app.js" }`
 * - `{ "file.exists": { path: "app.js" } }`
 */
export function parseRuntimeTestFields(
  vars: Record<string, unknown>,
): RuntimeTestFieldEntries {
  const preconditions = parseAssertionEntries(vars.preconditions, "preconditions", {
    allowMissing: true,
    mode: "precondition",
  });
  const should = parseAssertionEntries(vars.should, "should", {
    allowMissing: true,
    mode: "should",
  });
  const shouldNot = parseAssertionEntries(vars.should_not, "should_not", {
    allowMissing: true,
    mode: "should_not",
  });
  return {
    preconditions: preconditions.entries,
    should: should.entries,
    should_not: shouldNot.entries,
    errors: [...preconditions.errors, ...should.errors, ...shouldNot.errors],
  };
}

export function parseAssertionEntries(
  raw: unknown,
  field: string,
  options: { allowMissing?: boolean; mode?: AssertionMode } = {},
): ParsedAssertionEntries {
  const entries: AssertionEntry[] = [];
  const errors: AssertionEntryError[] = [];

  if (raw === undefined || raw === null) {
    if (!options.allowMissing) {
      errors.push({ field, reason: "must be an array of assertion entries" });
    }
    return { entries, errors };
  }

  const rawEntries = Schema.decodeUnknownEither(RuntimeFieldArraySchema)(raw);
  if (Either.isLeft(rawEntries)) {
    return {
      entries,
      errors: [{ field, reason: "must be an array of assertion entries" }],
    };
  }

  rawEntries.right.forEach((entry, index) => {
    const parsed = parseAssertionEntry(entry, field, index);
    if ("error" in parsed) {
      errors.push(parsed.error);
    } else {
      if (
        options.mode === "should_not" &&
        doubleNegativeCheckTypeSet.has(parsed.entry.type)
      ) {
        errors.push({
          field,
          index,
          reason: `"${parsed.entry.type}" must be declared under should, not should_not`,
        });
        return;
      }
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
  if (typeof entry === "string") {
    if (Either.isLeft(Schema.decodeUnknownEither(NonEmptyTypeSchema)(entry))) {
      return { error: { field, index, reason: "string entry must not be empty" } };
    }
    return { entry: { type: entry, args: {} } };
  }

  const decodedObject = Schema.decodeUnknownEither(EntryObjectSchema)(entry);
  if (Either.isLeft(decodedObject)) {
    return {
      error: {
        field,
        index,
        reason: "entry must be a string, { type: ... }, or shorthand object",
      },
    };
  }

  const candidate = decodedObject.right as TypedEntry;
  if ("type" in candidate) {
    const type = Schema.decodeUnknownEither(NonEmptyTypeSchema)(candidate.type);
    if (Either.isLeft(type)) {
      return {
        error: { field, index, reason: "`type` must be a non-empty string" },
      };
    }
    return { entry: { type: type.right, args: candidate } };
  }

  const keys = Object.keys(candidate);
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
  const args = candidate[type] ?? {};
  if (args !== null && typeof args !== "object") {
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
