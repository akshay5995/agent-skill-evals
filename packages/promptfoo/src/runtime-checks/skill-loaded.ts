import type { SkillLoadEvent, VerifierPlugin } from "../internal-types.js";
import { applyMode, decodeCheckArgs, isValidationFailure, SkillSelectionArgsSchema } from "./schemas.js";

function matchesLoad(
  event: SkillLoadEvent,
  args: { delivery?: "native" | "mcp"; provider?: string; server?: string; source?: string },
): boolean {
  return (
    (!args.delivery || event.delivery === args.delivery) &&
    (!args.provider || event.provider === args.provider) &&
    (!args.server || event.server === args.server) &&
    (!args.source || event.source === args.source)
  );
}

function loadedSkills(
  events: readonly SkillLoadEvent[],
  args: { delivery?: "native" | "mcp"; provider?: string; server?: string; source?: string },
): Set<string> {
  return new Set(events.filter((event) => matchesLoad(event, args)).map((event) => event.skill));
}

export const skillLoaded: VerifierPlugin = {
  type: "skill.loaded",
  verify({ assertion, evidence, mode }) {
    const args = decodeCheckArgs(SkillSelectionArgsSchema, assertion, "skill.loaded: skills must contain at least one name");
    if (isValidationFailure(args)) return args;
    const loaded = loadedSkills(evidence.skillsLoaded(), args);
    const missing = args.skills.filter((skill) => !loaded.has(skill));
    return applyMode(
      missing.length === 0,
      mode,
      `skill.loaded: loaded ${args.skills.join(", ")}`,
      `skill.loaded: missing ${missing.join(", ")}`,
    );
  },
};

export const skillNotLoaded: VerifierPlugin = {
  type: "skill.not_loaded",
  verify({ assertion, evidence, mode }) {
    const args = decodeCheckArgs(SkillSelectionArgsSchema, assertion, "skill.not_loaded: skills must contain at least one name");
    if (isValidationFailure(args)) return args;
    const loaded = loadedSkills(evidence.skillsLoaded(), args);
    const forbidden = args.skills.filter((skill) => loaded.has(skill));
    return applyMode(
      forbidden.length === 0,
      mode,
      `skill.not_loaded: absent ${args.skills.join(", ")}`,
      `skill.not_loaded: unexpectedly loaded ${forbidden.join(", ")}`,
    );
  },
};
