import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { parseYaml } from "./internal-services.js";
import { RUNTIME_CHECKS } from "./runtime-checks/catalog.js";

const NonEmptyString = z.string().min(1);
const RuntimeShorthandSchemas = RUNTIME_CHECKS.map(({ type, argsSchema }) =>
  z.object({ [type]: argsSchema }).strict(),
);
const RuntimeShorthandSchema = z.union(RuntimeShorthandSchemas as [
  (typeof RuntimeShorthandSchemas)[number],
  (typeof RuntimeShorthandSchemas)[number],
  ...(typeof RuntimeShorthandSchemas)[number][],
]);
const CheckEntrySchema = RuntimeShorthandSchema;
const CheckListSchema = z.array(CheckEntrySchema);
const RequiredCheckListSchema = z.array(CheckEntrySchema).min(1);

export const ConversationSchema = z
  .object({
    max_turns: z.number().int().min(1).max(20).optional(),
    scripted_user: z.array(NonEmptyString).min(1).optional(),
    simulated_user: z
      .object({
        goal: NonEmptyString,
        persona: NonEmptyString.optional(),
        allow_mocks: z.boolean().default(false),
      })
      .optional(),
  })
  .superRefine((conversation, ctx) => {
    if (conversation.scripted_user && conversation.simulated_user) {
      ctx.addIssue({
        code: "custom",
        message: "set either scripted_user or simulated_user, not both",
      });
    }
    if (!conversation.scripted_user && !conversation.simulated_user) {
      ctx.addIssue({
        code: "custom",
        message: "conversation requires scripted_user or simulated_user",
      });
    }
  });

export const RESERVED_SKILL_SERVER_MOCK_NAME = "skills";

const MockBaseSchema = z.object({
  name: NonEmptyString,
});

export const MockServiceSchema = z.discriminatedUnion("kind", [
  MockBaseSchema.extend({
    kind: z.literal("mcp"),
    transport: z.enum(["stdio", "http"]).default("stdio"),
    command: NonEmptyString.optional(),
    args: z.array(z.string()).default([]),
    url: NonEmptyString.optional(),
    env: z.record(z.string(), z.string()).optional(),
    provides_skill_evidence: z.boolean().default(false),
  }),
  MockBaseSchema.extend({
    kind: z.literal("http"),
    command: NonEmptyString,
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).optional(),
    ready: z.object({ path: NonEmptyString.default("/health"), timeout_ms: z.number().positive().optional() }).default({ path: "/health" }),
    expose_as: NonEmptyString,
  }),
  MockBaseSchema.extend({
    kind: z.literal("command"),
    executable: NonEmptyString,
  }),
]);

const BudgetSchema = z.object({
  max_total_tokens: z.number().int().nonnegative().optional(),
  max_prompt_tokens: z.number().int().nonnegative().optional(),
  max_completion_tokens: z.number().int().nonnegative().optional(),
  max_cached_tokens: z.number().int().nonnegative().optional(),
}).refine((budget) => Object.values(budget).some((value) => value !== undefined), {
  message: "budget requires at least one token limit",
});

const PromptfooAssertionSchema = z.record(z.string(), z.unknown());

export const SkillDeliverySchema = z.enum(["native", "mcp"]);

export const CleanTestCaseSchema = z.object({
  description: z.string().optional(),
  mode: z.enum(["behavior", "routing"]).default("behavior"),
  skill_delivery: SkillDeliverySchema.optional(),
  prompt: NonEmptyString,
  fixture: NonEmptyString.optional(),
  setup: z.array(NonEmptyString).default([]),
  supporting_skills: z.array(NonEmptyString).optional(),
  distractor_skills: z.array(NonEmptyString).optional(),
  preconditions: CheckListSchema.default([]),
  expect: RequiredCheckListSchema,
  conversation: ConversationSchema.optional(),
  budget: BudgetSchema.optional(),
  promptfoo: z.object({ assert: z.array(PromptfooAssertionSchema).default([]) }).optional(),
  environment: z.object({ mocks: z.array(MockServiceSchema).default([]) }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const CleanTestPackSchema = z.object({
  skill: NonEmptyString,
  supporting_skills: z.array(NonEmptyString).default([]),
  distractor_skills: z.array(NonEmptyString).default([]),
  builtin_distractor: z.boolean().default(true),
  skill_delivery: SkillDeliverySchema.default("native"),
  environment: z.object({ mocks: z.array(MockServiceSchema).default([]) }).optional(),
  tests: z.array(CleanTestCaseSchema).min(1),
}).superRefine((pack, ctx) => {
  const anyMcpDelivery = pack.tests.some((test) => (test.skill_delivery ?? pack.skill_delivery) === "mcp");
  if (anyMcpDelivery && (pack.environment?.mocks ?? []).some((mock) => mock.name === RESERVED_SKILL_SERVER_MOCK_NAME)) {
    ctx.addIssue({
      code: "custom",
      path: ["environment", "mocks"],
      message: `the Mock Service name "${RESERVED_SKILL_SERVER_MOCK_NAME}" is reserved for the built-in skill server when skill_delivery is mcp`,
    });
  }
  pack.tests.forEach((test, index) => {
    if ((test.skill_delivery ?? pack.skill_delivery) === "mcp"
      && (test.environment?.mocks ?? []).some((mock) => mock.name === RESERVED_SKILL_SERVER_MOCK_NAME)) {
      ctx.addIssue({
        code: "custom",
        path: ["tests", index, "environment", "mocks"],
        message: `the Mock Service name "${RESERVED_SKILL_SERVER_MOCK_NAME}" is reserved for the built-in skill server when skill_delivery is mcp`,
      });
    }
    if (test.mode !== "routing") return;
    const distractors = [
      ...pack.distractor_skills,
      ...(test.distractor_skills ?? []),
    ];
    if (!pack.builtin_distractor && distractors.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["tests", index, "distractor_skills"],
        message: "routing tests require at least one distractor skill",
      });
    }
  });
});

export type CleanTestPack = z.infer<typeof CleanTestPackSchema>;
export type CleanTestCase = z.infer<typeof CleanTestCaseSchema>;
export type MockService = z.infer<typeof MockServiceSchema>;

export interface PromptfooTestCase {
  description?: string;
  vars: Record<string, unknown>;
  assert: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
}

export interface TestPackGeneratorConfig {
  path: string;
  assertionPath?: string;
}

function migrationError(input: unknown): Error | undefined {
  if (Array.isArray(input)) {
    return new Error(
      "Legacy Promptfoo-shaped test packs are no longer supported. Use the clean Test Pack format with top-level `skill` and `tests` fields; move each case's prompt, fixture, and expectations out of `vars`.",
    );
  }
  return undefined;
}

export function parseTestPackDocument(input: unknown): CleanTestPack {
  const legacy = migrationError(input);
  if (legacy) throw legacy;
  const parsed = CleanTestPackSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid Agent Skill Evals Test Pack:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export async function loadTestPack(path: string): Promise<CleanTestPack> {
  const source = await readFile(path, "utf8");
  return parseTestPackDocument(parseYaml(source));
}

function budgetConfig(budget: CleanTestCase["budget"]): Record<string, number> {
  if (!budget) return {};
  return {
    ...(budget.max_total_tokens !== undefined ? { maxTotalTokens: budget.max_total_tokens } : {}),
    ...(budget.max_prompt_tokens !== undefined ? { maxPromptTokens: budget.max_prompt_tokens } : {}),
    ...(budget.max_completion_tokens !== undefined ? { maxCompletionTokens: budget.max_completion_tokens } : {}),
    ...(budget.max_cached_tokens !== undefined ? { maxCachedTokens: budget.max_cached_tokens } : {}),
  };
}

function conversationVars(conversation: CleanTestCase["conversation"]): Record<string, unknown> | undefined {
  if (!conversation) return undefined;
  return {
    ...(conversation.max_turns !== undefined ? { maxTurns: conversation.max_turns } : {}),
    ...(conversation.scripted_user ? { userTurns: conversation.scripted_user } : {}),
    ...(conversation.simulated_user
      ? {
          user: {
            goal: conversation.simulated_user.goal,
            ...(conversation.simulated_user.persona ? { persona: conversation.simulated_user.persona } : {}),
          },
          simulatedUserAllowMocks: conversation.simulated_user.allow_mocks,
        }
      : {}),
  };
}

export function toPromptfooTests(
  pack: CleanTestPack,
  options: { assertionPath: string; testPackDir?: string },
): PromptfooTestCase[] {
  return pack.tests.map((test) => {
    const supportingSkills = test.supporting_skills ?? pack.supporting_skills;
    const distractorSkills = [
      ...pack.distractor_skills,
      ...(test.distractor_skills ?? []),
    ];
    const environmentMocks = [
      ...(pack.environment?.mocks ?? []),
      ...(test.environment?.mocks ?? []),
    ];
    const assertions: Array<Record<string, unknown>> = [
      {
        type: "javascript",
        metric: "skill.test",
        value: options.assertionPath,
        config: { metric: "skill.test" },
      },
    ];
    if (test.budget) {
      assertions.push({
        type: "javascript",
        metric: "skill.budget",
        value: options.assertionPath,
        config: { metric: "skill.budget", agentSkillEvals: budgetConfig(test.budget) },
      });
    }
    assertions.push(...(test.promptfoo?.assert ?? []));

    return {
      ...(test.description ? { description: test.description } : {}),
      vars: {
        prompt: test.prompt,
        ...(options.testPackDir ? { testPackDir: options.testPackDir } : {}),
        skillPath: pack.skill,
        mode: test.mode,
        skillDelivery: test.skill_delivery ?? pack.skill_delivery,
        supportingSkills,
        distractorSkills,
        builtinDistractor: test.mode === "routing" && pack.builtin_distractor,
        ...(test.fixture ? { fixture: test.fixture } : {}),
        setup: test.setup,
        preconditions: test.preconditions,
        expect: test.expect,
        ...(test.conversation ? { conversation: conversationVars(test.conversation) } : {}),
        ...(environmentMocks.length > 0 ? { environment: { mocks: environmentMocks } } : {}),
      },
      assert: assertions,
      metadata: {
        ...(test.metadata ?? {}),
        agentSkillEvals: {
          mode: test.mode,
          skill: pack.skill,
        },
      },
    };
  });
}

export async function testPackGenerator(
  config: TestPackGeneratorConfig,
): Promise<PromptfooTestCase[]> {
  if (!config?.path) {
    throw new Error("Agent Skill Evals test generator requires config.path");
  }
  const pack = await loadTestPack(config.path);
  return toPromptfooTests(pack, {
    assertionPath: config.assertionPath ?? "file://./agent-skill-evals/assertions.js",
    testPackDir: dirname(config.path),
  });
}

export default testPackGenerator;
