import { z } from "zod";
import { resolveInvocation } from "./presets.js";

const OptionalStringArray = z
  .array(z.string())
  .transform((items): readonly string[] => items)
  .optional();

export const SkillEvidenceConfigSchema = z.object({
  mcpResource: z.object({
    uriArgPaths: OptionalStringArray,
    uriPatterns: OptionalStringArray,
  }).optional(),
  mcpTool: z.object({
    toolPatterns: OptionalStringArray,
  }).optional(),
  nativeArgs: z.object({
    whenArgs: OptionalStringArray,
    whenAnyArgs: OptionalStringArray,
    skillPathFlags: OptionalStringArray,
    provider: z.string().optional(),
    source: z.string().optional(),
  }).optional(),
});

const SimulatedUserConfigSchema = z.object({
  preset: z.string().optional(),
  adapter: z.string().optional(),
  command: z.string().optional(),
  args: OptionalStringArray,
  extraArgs: OptionalStringArray,
  timeoutMs: z.number().optional(),
});

export const ProviderConfigSchema = z.object({
  preset: z.string().optional(),
  adapter: z.string().optional(),
  command: z.string().optional(),
  args: OptionalStringArray,
  extraArgs: OptionalStringArray,
  model: z.string().optional(),
  timeoutMs: z.number().optional(),
  baseDir: z.string().optional(),
  skillEvidence: SkillEvidenceConfigSchema.optional(),
  simulatedUser: SimulatedUserConfigSchema.optional(),
});

export type SkillEvidenceConfig = z.infer<typeof SkillEvidenceConfigSchema>;
export type SimulatedUserConfig = z.infer<typeof SimulatedUserConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const DOCUMENTED_ADAPTERS = ["codex-json", "claude-code-json", "pi-json"] as const;

export function decodeProviderConfig(input: unknown): ProviderConfig | { error: string } {
  const decoded = ProviderConfigSchema.safeParse(input ?? {});
  if (!decoded.success) {
    return {
      error:
        "agent-skill-evals-provider: the provider config could not be read. " +
        "Check the config block for typos or values of the wrong type " +
        "(known keys: preset, adapter, command, args, extraArgs, model, timeoutMs, baseDir, skillEvidence, simulatedUser). " +
        `Details: ${z.prettifyError(decoded.error)}`,
    };
  }

  const config = decoded.data;
  const resolved = resolveInvocation(config);
  if ("error" in resolved) {
    return { error: `agent-skill-evals-provider: ${resolved.error}` };
  }
  return {
    ...config,
    ...(resolved.adapter ? { adapter: resolved.adapter } : {}),
    ...(resolved.command ? { command: resolved.command } : {}),
    ...(resolved.args ? { args: resolved.args } : {}),
  };
}
