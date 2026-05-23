import * as Schema from "effect/Schema";
import type { PromptfooAssertContext } from "./_shared.js";

export interface SkillCheckSettings {
  maxSkillLines: number;
  destructiveEffects: readonly string[];
  requireTokenBudget: boolean;
  riskyEffects: readonly string[];
}

const DEFAULT_SETTINGS: SkillCheckSettings = {
  maxSkillLines: 200,
  destructiveEffects: ["file.changes_outside_scope", "tool.called"],
  requireTokenBudget: false,
  riskyEffects: ["file.changes_outside_scope", "tool.called"],
};

const StringArraySchema = Schema.Array(Schema.String);

function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberSetting(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  return Schema.is(Schema.Number)(config[key]) ? config[key] : fallback;
}

function stringArraySetting(
  config: Record<string, unknown>,
  key: string,
  fallback: readonly string[],
): readonly string[] {
  return Schema.is(StringArraySchema)(config[key]) ? config[key] : fallback;
}

function booleanSetting(
  config: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  return typeof config[key] === "boolean" ? config[key] : fallback;
}

export function skillCheckSettings(context: PromptfooAssertContext): SkillCheckSettings {
  const config = configObject(context.config?.agentSkillEvals);
  return {
    maxSkillLines: numberSetting(config, "maxSkillLines", DEFAULT_SETTINGS.maxSkillLines),
    destructiveEffects: stringArraySetting(
      config,
      "destructiveEffects",
      DEFAULT_SETTINGS.destructiveEffects,
    ),
    requireTokenBudget: booleanSetting(
      config,
      "requireTokenBudget",
      DEFAULT_SETTINGS.requireTokenBudget,
    ),
    riskyEffects: stringArraySetting(
      config,
      "riskyEffects",
      DEFAULT_SETTINGS.riskyEffects,
    ),
  };
}
