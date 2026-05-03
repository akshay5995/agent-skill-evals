import type { StaticProviderMetadata } from "@skillkit/promptfoo-provider-static";

export interface PromptfooAssertContext {
  vars?: Record<string, unknown>;
  providerResponse?: { metadata?: unknown };
  test?: { vars?: Record<string, unknown> };
}

export interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
  componentResults?: Array<{ pass: boolean; score: number; reason: string }>;
}

export function getStaticMeta(
  context: PromptfooAssertContext,
): StaticProviderMetadata | null {
  const m = context.providerResponse?.metadata;
  if (m && typeof m === "object" && ("skill" in m || "tests" in m)) {
    return m as StaticProviderMetadata;
  }
  return null;
}

export function pass(reason: string, components?: GradingResult["componentResults"]): GradingResult {
  return { pass: true, score: 1, reason, componentResults: components };
}

export function fail(reason: string, components?: GradingResult["componentResults"]): GradingResult {
  return { pass: false, score: 0, reason, componentResults: components };
}
