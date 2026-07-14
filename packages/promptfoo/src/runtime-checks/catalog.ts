import type { VerifierPlugin } from "../internal-types.js";
import {
  FileChangesWithinArgsSchema,
  FileContainsArgsSchema,
  OutputContainsArgsSchema,
  OutputMatchesArgsSchema,
  PathArgsSchema,
  SkillSelectionArgsSchema,
  ToolCalledArgsSchema,
  ToolCountArgsSchema,
  ToolNotCalledArgsSchema,
  ToolSequenceArgsSchema,
  TurnCountArgsSchema,
  VerifierArgsSchema,
} from "./schemas.js";
import { verifierFails, verifierSucceeds } from "./verifier-checks.js";
import { fileChangesWithin, fileContains, fileCreated, fileExists, fileUnchanged } from "./file-code-checks.js";
import { skillLoaded, skillNotLoaded } from "./skill-loaded.js";
import { toolCalled, toolCount, toolNotCalled, toolSequence, turnCount } from "./tool-turn-checks.js";
import { outputContains, outputMatches } from "./output-checks.js";

export const RUNTIME_CHECKS = [
  { type: "verifier.succeeds", plugin: verifierSucceeds, argsSchema: VerifierArgsSchema },
  { type: "verifier.fails", plugin: verifierFails, argsSchema: VerifierArgsSchema },
  { type: "file.exists", plugin: fileExists, argsSchema: PathArgsSchema },
  { type: "file.created", plugin: fileCreated, argsSchema: PathArgsSchema },
  { type: "file.contains", plugin: fileContains, argsSchema: FileContainsArgsSchema },
  { type: "file.unchanged", plugin: fileUnchanged, argsSchema: PathArgsSchema },
  { type: "file.changes_within", plugin: fileChangesWithin, argsSchema: FileChangesWithinArgsSchema },
  { type: "tool.called", plugin: toolCalled, argsSchema: ToolCalledArgsSchema },
  { type: "tool.not_called", plugin: toolNotCalled, argsSchema: ToolNotCalledArgsSchema },
  { type: "tool.count", plugin: toolCount, argsSchema: ToolCountArgsSchema },
  { type: "tool.sequence", plugin: toolSequence, argsSchema: ToolSequenceArgsSchema },
  { type: "turn.count", plugin: turnCount, argsSchema: TurnCountArgsSchema },
  { type: "skill.loaded", plugin: skillLoaded, argsSchema: SkillSelectionArgsSchema },
  { type: "skill.not_loaded", plugin: skillNotLoaded, argsSchema: SkillSelectionArgsSchema },
  { type: "output.contains", plugin: outputContains, argsSchema: OutputContainsArgsSchema },
  { type: "output.matches", plugin: outputMatches, argsSchema: OutputMatchesArgsSchema },
] as const;

export const RUNTIME_CHECK_TYPES = RUNTIME_CHECKS.map((check) => check.type);
export const RUNTIME_CHECKS_BY_TYPE: ReadonlyMap<string, VerifierPlugin> = new Map(
  RUNTIME_CHECKS.map(({ type, plugin }) => [type, plugin]),
);
