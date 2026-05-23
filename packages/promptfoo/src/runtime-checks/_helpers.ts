import type {
  AssertionMode,
  AgentSkillEvalsAssertionResult,
} from "../internal-types.js";

export function result(
  pass: boolean,
  reason: string,
  evidence?: unknown,
): AgentSkillEvalsAssertionResult {
  return { pass, score: pass ? 1 : 0, reason, evidence };
}

export function validationFailure(reason: string): AgentSkillEvalsAssertionResult {
  return result(false, reason);
}

/**
 * Map a "matched" boolean to a pass result based on mode. Used by effect
 * types that don't self-encode polarity (file.exists, tool.called, ...).
 *
 * - should: pass = matched
 * - should_not: pass = !matched
 * - precondition: pass = matched (precondition asserts a current state)
 */
export function applyMode(
  matched: boolean,
  mode: AssertionMode,
  reasonMatched: string,
  reasonUnmatched: string,
): AgentSkillEvalsAssertionResult {
  switch (mode) {
    case "should":
    case "precondition":
      return result(matched, matched ? reasonMatched : reasonUnmatched);
    case "should_not":
      return result(!matched, matched ? reasonMatched : reasonUnmatched);
  }
}
