import type { VerifierPlugin } from "../internal-types.js";
import { applyMode, decodeCheckArgs, isValidationFailure, OutputContainsArgsSchema, OutputMatchesArgsSchema } from "./schemas.js";

export const outputContains: VerifierPlugin = {
  type: "output.contains",
  verify(ctx) {
    const args = decodeCheckArgs(OutputContainsArgsSchema, ctx.assertion, "output.contains: text is required");
    if (isValidationFailure(args)) return args;
    const matched = ctx.evidence.output().includes(args.text);
    return applyMode(matched, ctx.mode, `output.contains: found ${JSON.stringify(args.text)}`, `output.contains: missing ${JSON.stringify(args.text)}`);
  },
};

export const outputMatches: VerifierPlugin = {
  type: "output.matches",
  verify(ctx) {
    const args = decodeCheckArgs(OutputMatchesArgsSchema, ctx.assertion, "output.matches: pattern is required");
    if (isValidationFailure(args)) return args;
    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern, args.flags);
    } catch (error) {
      return { pass: false, score: 0, reason: `output.matches: invalid regex: ${error instanceof Error ? error.message : String(error)}` };
    }
    const matched = regex.test(ctx.evidence.output());
    return applyMode(matched, ctx.mode, `output.matches: /${args.pattern}/${args.flags ?? ""} matched`, `output.matches: /${args.pattern}/${args.flags ?? ""} did not match`);
  },
};
