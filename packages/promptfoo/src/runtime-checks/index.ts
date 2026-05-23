import type { VerifierPlugin } from "../internal-types.js";

import { verifierSucceeds } from "./verifier-succeeds.js";
import { verifierFails } from "./verifier-fails.js";
import { fileExists } from "./file-exists.js";
import { fileCreated } from "./file-created.js";
import { fileNotModified } from "./file-not-modified.js";
import { fileContains } from "./file-contains.js";
import { codePatternExists } from "./code-pattern-exists.js";
import { codeNoPattern } from "./code-no-pattern.js";
import { fileChangesOutsideScope } from "./file-changes-outside-scope.js";
import { toolCalled } from "./tool-called.js";
import { toolNotCalled } from "./tool-not-called.js";
import { skillLoaded } from "./skill-loaded.js";
import { RUNTIME_CHECK_TYPES } from "./check-set.js";

export const corePlugins: readonly VerifierPlugin[] = [
  verifierSucceeds,
  verifierFails,
  fileExists,
  fileCreated,
  fileContains,
  fileNotModified,
  fileChangesOutsideScope,
  codePatternExists,
  codeNoPattern,
  toolCalled,
  toolNotCalled,
  skillLoaded,
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

export { RUNTIME_CHECK_TYPES };

export {
  verifierSucceeds,
  verifierFails,
  fileExists,
  fileCreated,
  fileNotModified,
  fileContains,
  codePatternExists,
  codeNoPattern,
  fileChangesOutsideScope,
  toolCalled,
  toolNotCalled,
  skillLoaded,
};
