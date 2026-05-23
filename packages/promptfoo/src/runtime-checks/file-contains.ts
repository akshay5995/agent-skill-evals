import * as Effect from "effect/Effect";
import type { VerifierPlugin } from "../internal-types.js";
import { applyMode } from "./_helpers.js";
import {
  decodeCheckArgs,
  FileContainsArgsSchema,
  isValidationFailure,
} from "./schemas.js";

export const fileContains: VerifierPlugin = {
  type: "file.contains",
  verify(ctx) {
    return Effect.gen(function* () {
    const a = decodeCheckArgs(
      FileContainsArgsSchema,
      ctx.assertion,
      "file.contains: assertion.path must be a non-empty string and assertion.text must be a string",
    );
    if (isValidationFailure(a)) return a;
    const content = yield* ctx.world.readFile(a.path);
    const matched = content !== null && content.includes(a.text);
    return applyMode(
      matched,
      ctx.mode,
      `file.contains: ${a.path} contains "${a.text.slice(0, 40)}"`,
      content === null
        ? `file.contains: ${a.path} not found`
        : `file.contains: ${a.path} missing "${a.text.slice(0, 40)}"`,
    );
    });
  },
};
