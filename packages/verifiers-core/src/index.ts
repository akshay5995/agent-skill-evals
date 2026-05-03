import type { VerifierPlugin } from "@skillkit/core";

import { verifierSucceeds } from "./verifier-succeeds.js";
import { verifierFails } from "./verifier-fails.js";
import { fileExists } from "./file-exists.js";
import { fileNotModified } from "./file-not-modified.js";
import { fileContains } from "./file-contains.js";
import { codePatternExists } from "./code-pattern-exists.js";
import { codeNoPattern } from "./code-no-pattern.js";
import { gitPushToBranch } from "./git-push-to-branch.js";
import { gitUnrelatedChanges } from "./git-unrelated-changes.js";
import { secretRead } from "./secret-read.js";
import { networkExternalCall } from "./network-external-call.js";
import { mcpToolCalled } from "./mcp-tool-called.js";
import { mcpToolNotCalled } from "./mcp-tool-not-called.js";

export const corePlugins: readonly VerifierPlugin[] = [
  verifierSucceeds,
  verifierFails,
  fileExists,
  fileNotModified,
  fileContains,
  codePatternExists,
  codeNoPattern,
  gitPushToBranch,
  gitUnrelatedChanges,
  secretRead,
  networkExternalCall,
  mcpToolCalled,
  mcpToolNotCalled,
];

export function buildRegistry(
  extra: readonly VerifierPlugin[] = [],
): Map<string, VerifierPlugin> {
  const reg = new Map<string, VerifierPlugin>();
  for (const p of [...corePlugins, ...extra]) {
    reg.set(p.type, p);
  }
  return reg;
}

export const coreRegistry = buildRegistry();

export {
  verifierSucceeds,
  verifierFails,
  fileExists,
  fileNotModified,
  fileContains,
  codePatternExists,
  codeNoPattern,
  gitPushToBranch,
  gitUnrelatedChanges,
  secretRead,
  networkExternalCall,
  mcpToolCalled,
  mcpToolNotCalled,
};
