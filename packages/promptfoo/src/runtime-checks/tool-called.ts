import * as Effect from "effect/Effect";
import type { VerifierPlugin } from "../internal-types.js";
import { applyMode } from "./_helpers.js";
import { matchesRecordedCall } from "./_call-match.js";
import { decodeCheckArgs, isValidationFailure, ToolCalledArgsSchema } from "./schemas.js";

export const toolCalled: VerifierPlugin = {
  type: "tool.called",
  verify({ assertion, evidence, mode }) {
    const a = decodeCheckArgs(
      ToolCalledArgsSchema,
      assertion,
      "tool.called: assertion.tool must be a non-empty string",
    );
    if (isValidationFailure(a)) return Effect.succeed(a);
    const calls = evidence.toolCalls();
    if (!calls.length) {
      return Effect.succeed({ pass: false, score: 0, reason: "tool.called: no built-in tool evidence found" });
    }
    const found = calls.some((c) => matchesRecordedCall(c, a));
    return Effect.succeed(applyMode(
      found,
      mode,
      "tool.called: matched built-in tool call",
      "tool.called: matching call not found",
    ));
  },
};
