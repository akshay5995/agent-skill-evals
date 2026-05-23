import * as Effect from "effect/Effect";
import type { VerifierPlugin } from "../internal-types.js";
import { applyMode } from "./_helpers.js";
import {
  decodeCheckArgs,
  FileChangesOutsideScopeArgsSchema,
  isValidationFailure,
} from "./schemas.js";

export const fileChangesOutsideScope: VerifierPlugin = {
  type: "file.changes_outside_scope",
  verify(ctx) {
    const a = decodeCheckArgs(
      FileChangesOutsideScopeArgsSchema,
      ctx.assertion,
      "file.changes_outside_scope: assertion.scope must contain at least one non-empty string",
    );
    if (isValidationFailure(a)) return Effect.succeed(a);
    const written = ctx.evidence.filesWritten();
    const unrelated = written.filter((f) => !a.scope.some((s) => f.path.startsWith(s)));
    const matched = unrelated.length > 0;
    return Effect.succeed(applyMode(
      matched,
      ctx.mode,
      `file.changes_outside_scope: ${unrelated.length} file(s) outside scope: ${unrelated.slice(0, 3).map((f) => f.path).join(", ")}`,
      `file.changes_outside_scope: no changes outside scope`,
    ));
  },
};
