import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { parse as parseYamlRaw } from "yaml";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function pathExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * YAML parse with merge keys enabled (<<: *anchor), matching Promptfoo's
 * js-yaml loader so test packs can hoist shared vars into anchored blocks.
 */
export function parseYaml(input: string): unknown {
  return parseYamlRaw(input, { merge: true });
}
