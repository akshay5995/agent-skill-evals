import * as Schema from "effect/Schema";
import type { AssertionEntryError } from "../assertion-entries.js";

export interface DecodedTestPackDocument {
  cases: readonly unknown[];
  parseError?: string;
}

export interface DecodedStaticTestCase {
  caseRecord: Record<string, unknown>;
  vars: Record<string, unknown>;
  entryErrors: AssertionEntryError[];
}

const UnknownRecordSchema = Schema.Unknown.pipe(
  Schema.filter(
    (value): value is Record<string, unknown> => isRecord(value),
    {
      identifier: "UnknownRecord",
      message: () => "must be an object",
    },
  ),
);

const UnknownArraySchema = Schema.Array(Schema.Unknown);

export function decodeTestPackDocument(value: unknown): DecodedTestPackDocument {
  if (Array.isArray(value)) {
    try {
      return { cases: Schema.decodeUnknownSync(UnknownArraySchema)(value) };
    } catch (err) {
      return { cases: [], parseError: schemaErrorMessage(err) };
    }
  }

  if (decodeRecord(value) !== null) {
    return { cases: [value] };
  }

  return {
    cases: [],
    parseError: "test pack document must be an object or array of objects",
  };
}

export function decodeStaticTestCase(value: unknown): DecodedStaticTestCase {
  const caseRecord = decodeRecord(value);
  if (caseRecord === null) {
    return {
      caseRecord: {},
      vars: {},
      entryErrors: [{ field: "case", reason: "must be an object" }],
    };
  }

  const rawVars = caseRecord.vars;
  if (rawVars === undefined || rawVars === null) {
    return { caseRecord, vars: {}, entryErrors: [] };
  }

  const vars = decodeRecord(rawVars);
  if (vars === null) {
    return {
      caseRecord,
      vars: {},
      entryErrors: [{ field: "vars", reason: "must be an object" }],
    };
  }

  return { caseRecord, vars, entryErrors: [] };
}

function decodeRecord(value: unknown): Record<string, unknown> | null {
  try {
    return Schema.decodeUnknownSync(UnknownRecordSchema)(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
