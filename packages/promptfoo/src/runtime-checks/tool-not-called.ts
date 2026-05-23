import * as Effect from "effect/Effect";
import type { VerifierPlugin } from "../internal-types.js";
import { matchesRecordedCall } from "./_call-match.js";
import { decodeToolNotCalledArgs, isValidationFailure } from "./schemas.js";

export const toolNotCalled: VerifierPlugin = {
  type: "tool.not_called",
  verify({ assertion, evidence }) {
    const a = decodeToolNotCalledArgs(assertion);
    if (isValidationFailure(a)) return Effect.succeed(a);
    const calls = evidence.toolCalls();
    const found = calls.some((c) => matchesRecordedCall(c, a));
    return Effect.succeed(found
      ? { pass: false, score: 0, reason: "tool.not_called: forbidden built-in tool call observed" }
      : { pass: true, score: 1, reason: "tool.not_called: no matching built-in tool calls observed" });
  },
};
