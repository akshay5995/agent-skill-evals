export const RUNTIME_CHECK_TYPES = [
  "verifier.succeeds",
  "verifier.fails",
  "file.exists",
  "file.created",
  "file.contains",
  "file.not_modified",
  "file.changes_outside_scope",
  "code.pattern_exists",
  "code.no_pattern",
  "tool.called",
  "tool.not_called",
  "skill.loaded",
] as const;

export type RuntimeCheckType = (typeof RUNTIME_CHECK_TYPES)[number];

export const DOUBLE_NEGATIVE_CHECK_TYPES = [
  "code.no_pattern",
  "file.not_modified",
  "tool.not_called",
] as const satisfies readonly RuntimeCheckType[];

export const runtimeCheckTypeSet = new Set<string>(RUNTIME_CHECK_TYPES);
export const doubleNegativeCheckTypeSet = new Set<string>(DOUBLE_NEGATIVE_CHECK_TYPES);
