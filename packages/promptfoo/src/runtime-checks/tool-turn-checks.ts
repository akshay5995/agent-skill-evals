import type { VerifierPlugin } from "../internal-types.js";
import { matchesSubset } from "./_match.js";
import {
  applyMode,
  decodeCheckArgs,
  decodeToolNotCalledArgs,
  isValidationFailure,
  ToolCalledArgsSchema,
  ToolCountArgsSchema,
  ToolSequenceArgsSchema,
  TurnCountArgsSchema,
  validationFailure,
} from "./schemas.js";

interface CallMatchArgs {
  tool?: string;
  provider?: string;
  server?: string;
  args_match?: unknown;
}

interface RecordedCall {
  tool: string;
  provider?: string;
  server?: string;
  args?: unknown;
}

function matchesRecordedCall(call: RecordedCall, args: CallMatchArgs): boolean {
  return (
    (!args.tool || call.tool === args.tool) &&
    (!args.provider || call.provider === args.provider) &&
    (!args.server || call.server === args.server) &&
    (args.args_match === undefined || matchesSubset(call.args, args.args_match))
  );
}

export const toolCalled: VerifierPlugin = {
  type: "tool.called",
  verify({ assertion, evidence, mode }) {
    const a = decodeCheckArgs(
      ToolCalledArgsSchema,
      assertion,
      "tool.called: assertion.tool must be a non-empty string",
    );
    if (isValidationFailure(a)) return a;
    const calls = evidence.toolCalls();
    if (!calls.length) {
      return { pass: false, score: 0, reason: "tool.called: no built-in tool evidence found" };
    }
    const found = calls.some((c) => matchesRecordedCall(c, a));
    return applyMode(
      found,
      mode,
      "tool.called: matched built-in tool call",
      "tool.called: matching call not found",
    );
  },
};

export const toolNotCalled: VerifierPlugin = {
  type: "tool.not_called",
  verify({ assertion, evidence }) {
    const a = decodeToolNotCalledArgs(assertion);
    if (isValidationFailure(a)) return a;
    const calls = evidence.toolCalls();
    const found = calls.some((c) => matchesRecordedCall(c, a));
    return found
      ? { pass: false, score: 0, reason: "tool.not_called: forbidden built-in tool call observed" }
      : { pass: true, score: 1, reason: "tool.not_called: no matching built-in tool calls observed" };
  },
};

/**
 * Count matching tool calls, optionally scoped to conversation turns.
 * Single-turn runs record no turn tags; their calls count as turn 1.
 */
export const toolCount: VerifierPlugin = {
  type: "tool.count",
  verify({ assertion, evidence, mode }) {
    const a = decodeCheckArgs(
      ToolCountArgsSchema,
      assertion,
      "tool.count: invalid args (tool/provider/server/args_match/turn/before_turn/after_turn/min/max)",
    );
    if (isValidationFailure(a)) return a;
    if (a.min === undefined && a.max === undefined) {
      return validationFailure("tool.count: set min and/or max");
    }
    const count = evidence.toolCalls().filter((call) => {
      const turn = call.turn ?? 1;
      if (a.turn !== undefined && turn !== a.turn) return false;
      if (a.before_turn !== undefined && turn >= a.before_turn) return false;
      if (a.after_turn !== undefined && turn <= a.after_turn) return false;
      return matchesRecordedCall(call, a);
    }).length;
    const within =
      (a.min === undefined || count >= a.min) &&
      (a.max === undefined || count <= a.max);
    const bounds = [
      a.min !== undefined ? `min ${a.min}` : undefined,
      a.max !== undefined ? `max ${a.max}` : undefined,
    ].filter(Boolean).join(", ");
    return applyMode(
      within,
      mode,
      `tool.count: ${count} matching call(s) within bounds (${bounds})`,
      `tool.count: ${count} matching call(s) outside bounds (${bounds})`,
    );
  },
};

/**
 * Assert an ordered subsequence of tool calls: every listed tool name must
 * appear in recorded order, with any number of other calls in between.
 */
export const toolSequence: VerifierPlugin = {
  type: "tool.sequence",
  verify({ assertion, evidence, mode }) {
    const a = decodeCheckArgs(
      ToolSequenceArgsSchema,
      assertion,
      "tool.sequence: assertion.order must list at least two tool names",
    );
    if (isValidationFailure(a)) return a;
    const names = evidence.toolCalls().map((call) => call.tool);
    let next = 0;
    for (const name of names) {
      if (name === a.order[next]) next += 1;
      if (next === a.order.length) break;
    }
    const matched = next === a.order.length;
    const missing = matched ? "" : ` (stuck at "${a.order[next]}")`;
    return applyMode(
      matched,
      mode,
      `tool.sequence: observed ${a.order.join(" -> ")} in order`,
      `tool.sequence: did not observe ${a.order.join(" -> ")} in order${missing}`,
    );
  },
};

/**
 * Bound the number of agent turns. A single-turn run counts as one turn.
 */
export const turnCount: VerifierPlugin = {
  type: "turn.count",
  verify({ assertion, evidence, mode }) {
    const a = decodeCheckArgs(
      TurnCountArgsSchema,
      assertion,
      "turn.count: invalid args (min/max must be numbers)",
    );
    if (isValidationFailure(a)) return a;
    if (a.min === undefined && a.max === undefined) {
      return validationFailure("turn.count: set min and/or max");
    }
    const turns = evidence.turns?.() ?? [];
    const agentTurns = turns.filter((turn) => turn.role === "agent").length;
    const count = agentTurns > 0 ? agentTurns : 1;
    const within =
      (a.min === undefined || count >= a.min) &&
      (a.max === undefined || count <= a.max);
    const bounds = [
      a.min !== undefined ? `min ${a.min}` : undefined,
      a.max !== undefined ? `max ${a.max}` : undefined,
    ].filter(Boolean).join(", ");
    return applyMode(
      within,
      mode,
      `turn.count: ${count} agent turn(s) within bounds (${bounds})`,
      `turn.count: ${count} agent turn(s) outside bounds (${bounds})`,
    );
  },
};
