import type { VerifierPlugin } from "../internal-types.js";
import {
  applyMode,
  decodeCheckArgs,
  FileChangesWithinArgsSchema,
  FileContainsArgsSchema,
  isValidationFailure,
  PathArgsSchema,
} from "./schemas.js";

export const fileExists: VerifierPlugin = {
  type: "file.exists",
  async verify(ctx) {
    const args = decodeCheckArgs(PathArgsSchema, ctx.assertion, "file.exists: path must be a non-empty string");
    if (isValidationFailure(args)) return args;
    const exists = (await ctx.world.readFile(args.path)) !== null;
    return applyMode(exists, ctx.mode, `file.exists: ${args.path} present`, `file.exists: ${args.path} not found`);
  },
};

export const fileCreated: VerifierPlugin = {
  type: "file.created",
  verify(ctx) {
    const args = decodeCheckArgs(PathArgsSchema, ctx.assertion, "file.created: path must be a non-empty string");
    if (isValidationFailure(args)) return args;
    const created = ctx.evidence.filesWritten().some((event) => event.path === args.path && event.op === "create");
    return applyMode(created, ctx.mode, `file.created: ${args.path} created`, `file.created: ${args.path} was not created`);
  },
};

export const fileUnchanged: VerifierPlugin = {
  type: "file.unchanged",
  verify(ctx) {
    const args = decodeCheckArgs(PathArgsSchema, ctx.assertion, "file.unchanged: path must be a non-empty string");
    if (isValidationFailure(args)) return args;
    const unchanged = !ctx.evidence.filesWritten().some((event) => event.path === args.path);
    return applyMode(unchanged, ctx.mode, `file.unchanged: ${args.path} unchanged`, `file.unchanged: ${args.path} changed`);
  },
};

export const fileContains: VerifierPlugin = {
  type: "file.contains",
  async verify(ctx) {
    const args = decodeCheckArgs(FileContainsArgsSchema, ctx.assertion, "file.contains: path and text are required");
    if (isValidationFailure(args)) return args;
    const content = await ctx.world.readFile(args.path);
    const matched = content !== null && content.includes(args.text);
    return applyMode(
      matched,
      ctx.mode,
      `file.contains: ${args.path} contains ${JSON.stringify(args.text.slice(0, 40))}`,
      content === null ? `file.contains: ${args.path} not found` : `file.contains: ${args.path} missing ${JSON.stringify(args.text.slice(0, 40))}`,
    );
  },
};

/** A path declaration is either one exact file or a directory ending in /. */
function pathAllowed(path: string, allowed: string): boolean {
  return path === allowed || (allowed.endsWith("/") && path.startsWith(allowed));
}

export const fileChangesWithin: VerifierPlugin = {
  type: "file.changes_within",
  verify(ctx) {
    const args = decodeCheckArgs(FileChangesWithinArgsSchema, ctx.assertion, "file.changes_within: paths must contain at least one path");
    if (isValidationFailure(args)) return args;
    const outside = ctx.evidence.filesWritten().filter((event) =>
      !args.paths.some((allowed) => pathAllowed(event.path, allowed))
    );
    const matched = outside.length === 0;
    return applyMode(
      matched,
      ctx.mode,
      `file.changes_within: all changes stayed within ${args.paths.join(", ")}`,
      `file.changes_within: changed outside allowed paths: ${outside.slice(0, 3).map((event) => event.path).join(", ")}`,
    );
  },
};
