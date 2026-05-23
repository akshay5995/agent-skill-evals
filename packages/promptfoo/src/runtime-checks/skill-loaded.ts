import * as Effect from "effect/Effect";
import type { SkillLoadEvent, VerifierPlugin } from "../internal-types.js";
import { applyMode } from "./_helpers.js";
import { decodeCheckArgs, isValidationFailure, SkillLoadedArgsSchema } from "./schemas.js";

export const skillLoaded: VerifierPlugin = {
  type: "skill.loaded",
  verify({ assertion, evidence, mode }) {
    const a = decodeCheckArgs(
      SkillLoadedArgsSchema,
      assertion,
      "skill.loaded: assertion must be an object",
    );
    if (isValidationFailure(a)) return Effect.succeed(a);

    const shouldInclude = a.should_include ?? [];
    const shouldExclude = a.should_exclude ?? [];
    if (shouldInclude.length === 0 && shouldExclude.length === 0) {
      return Effect.succeed({
        pass: false,
        score: 0,
        reason: "skill.loaded: declare should_include or should_exclude",
      });
    }

    const events = evidence.skillsLoaded().filter((event) => matchesLoad(event, a));
    const loaded = new Set(events.map((event) => event.skill));
    const missing = shouldInclude.filter((skill) => !loaded.has(skill));
    const forbidden = shouldExclude.filter((skill) => loaded.has(skill));

    const matched = missing.length === 0 && forbidden.length === 0;
    const unmatchedReason = skillLoadedMismatchReason(missing, forbidden);

    return Effect.succeed(applyMode(
      matched,
      mode,
      "skill.loaded: expected skill context observed",
      unmatchedReason,
    ));
  },
};

function skillLoadedMismatchReason(
  missing: readonly string[],
  forbidden: readonly string[],
): string {
  const reasons = [
    missing.length ? `missing loaded skill(s): ${missing.join(", ")}` : "",
    forbidden.length ? `forbidden loaded skill(s): ${forbidden.join(", ")}` : "",
  ].filter(Boolean);
  return `skill.loaded: ${reasons.join("; ")}`;
}

function matchesLoad(
  event: SkillLoadEvent,
  args: {
    delivery?: "native" | "mcp";
    provider?: string;
    server?: string;
    source?: string;
  },
): boolean {
  return (
    (!args.delivery || event.delivery === args.delivery) &&
    (!args.provider || event.provider === args.provider) &&
    (!args.server || event.server === args.server) &&
    (!args.source || event.source === args.source)
  );
}
