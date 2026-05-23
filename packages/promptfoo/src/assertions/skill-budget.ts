import type { GradingResult, PromptfooAssertContext } from "./_shared.js";

interface TokenUsage {
  total?: number;
  prompt?: number;
  completion?: number;
  cached?: number;
}

interface BudgetSettings {
  maxTotalTokens?: number;
  maxPromptTokens?: number;
  maxCompletionTokens?: number;
  maxCachedTokens?: number;
}

const budgetFields = [
  ["total", "maxTotalTokens"],
  ["prompt", "maxPromptTokens"],
  ["completion", "maxCompletionTokens"],
  ["cached", "maxCachedTokens"],
] as const;

function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberSetting(config: Record<string, unknown>, key: keyof BudgetSettings): number | undefined {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function budgetSettings(context: PromptfooAssertContext): BudgetSettings {
  const config = configObject(context.config?.agentSkillEvals);
  return {
    maxTotalTokens: numberSetting(config, "maxTotalTokens"),
    maxPromptTokens: numberSetting(config, "maxPromptTokens"),
    maxCompletionTokens: numberSetting(config, "maxCompletionTokens"),
    maxCachedTokens: numberSetting(config, "maxCachedTokens"),
  };
}

function tokenUsage(context: PromptfooAssertContext): TokenUsage | undefined {
  const usage = context.providerResponse?.tokenUsage;
  return usage && typeof usage === "object" && !Array.isArray(usage)
    ? usage as TokenUsage
    : undefined;
}

export default async function skillBudget(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const usage = tokenUsage(context);
  if (!usage) {
    return {
      pass: false,
      score: 0,
      reason: "skill.budget: provider tokenUsage missing",
    };
  }

  const settings = budgetSettings(context);
  const configured = budgetFields.filter(([, limitKey]) => settings[limitKey] !== undefined);
  if (configured.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: "skill.budget: configure at least one token limit",
    };
  }

  const components = configured.map(([usageKey, limitKey]) => {
    const actual = usage[usageKey];
    const limit = settings[limitKey] ?? 0;
    if (typeof actual !== "number" || !Number.isFinite(actual)) {
      return {
        pass: false,
        score: 0,
        reason: `${usageKey} tokens missing`,
      };
    }
    return {
      pass: actual <= limit,
      score: actual <= limit ? 1 : 0,
      reason: `${usageKey} tokens ${actual} <= ${limit}`,
    };
  });
  const failed = components.filter((component) => !component.pass);
  return {
    pass: failed.length === 0,
    score: failed.length === 0 ? 1 : 0,
    reason: failed.length === 0
      ? `skill.budget: ${components.length} budget(s) passed`
      : failed.map((component) => component.reason).join("; "),
    componentResults: components,
  };
}
