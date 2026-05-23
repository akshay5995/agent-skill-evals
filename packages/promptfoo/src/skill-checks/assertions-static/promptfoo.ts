import * as Effect from "effect/Effect";
import contextEconomy from "./context-economy.js";
import executableHelper from "./executable-helper.js";
import instructionCalibration from "./instruction-calibration.js";
import negativeCoverage from "./negative-coverage.js";
import routingMetadata from "./routing-metadata.js";
import scenarioValidity from "./scenario-validity.js";
import type { GradingResult, PromptfooAssertContext } from "./_shared.js";

type AssertionFn = (
  output: string,
  context: PromptfooAssertContext,
) => Promise<GradingResult>;

const metricChecks: Record<string, readonly AssertionFn[]> = {
  "skill.activation": [routingMetadata],
  "skill.budgets": [scenarioValidity],
  "skill.context": [contextEconomy],
  "skill.instructions": [instructionCalibration],
  "skill.tests": [scenarioValidity, negativeCoverage],
  "skill.verifiers": [executableHelper],
};

metricChecks["skill.checks"] = [
  routingMetadata,
  contextEconomy,
  instructionCalibration,
  scenarioValidity,
  negativeCoverage,
  executableHelper,
];

const availableMetrics = Object.keys(metricChecks).sort().join(", ");

function metricFrom(context: PromptfooAssertContext): string | undefined {
  const candidates = [
    context.assertion?.metric,
    context.assert?.metric,
    context.config?.metric,
    context.metric,
  ];
  return candidates.find((metric): metric is string => typeof metric === "string");
}

async function runChecks(
  output: string,
  context: PromptfooAssertContext,
  checks: readonly AssertionFn[],
): Promise<GradingResult> {
  return Effect.runPromise(runChecksEffect(output, context, checks));
}

function runChecksEffect(
  output: string,
  context: PromptfooAssertContext,
  checks: readonly AssertionFn[],
): Effect.Effect<GradingResult> {
  return Effect.gen(function* () {
  const results = yield* Effect.forEach(
    checks,
    (check) => Effect.promise(() => check(output, context)),
    { concurrency: "unbounded" },
  );
  const failed = results.filter((result) => !result.pass);
  const soft = results.filter((result) => result.pass && result.score < 1);
  return {
    pass: failed.length === 0,
    score: failed.length === 0
      ? Math.min(...results.map((result) => result.score))
      : 0,
    reason: failed.length === 0
      ? soft.length > 0
        ? soft.map((result) => result.reason).join("; ")
        : `skill checks: ${results.length} check(s) passed`
      : failed.map((result) => result.reason).join("; "),
    componentResults: results,
  };
  });
}

export async function agentSkillEvalsStaticAssertions(
  output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  return Effect.runPromise(agentSkillEvalsStaticAssertionsEffect(output, context));
}

function agentSkillEvalsStaticAssertionsEffect(
  output: string,
  context: PromptfooAssertContext,
): Effect.Effect<GradingResult> {
  return Effect.gen(function* () {
  const metric = metricFrom(context);
  const checks = metric ? metricChecks[metric] : undefined;
  if (!checks) {
    return {
      pass: false,
      score: 0,
      reason: `agent-skill-evals skill checks: unknown metric "${metric ?? "missing"}". Available metrics: ${availableMetrics}`,
    };
  }
  return yield* runChecksEffect(output, context, checks);
  });
}

export default agentSkillEvalsStaticAssertions;
