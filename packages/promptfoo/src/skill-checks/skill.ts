import { join, dirname, isAbsolute, resolve as resolvePath } from "node:path";
import * as Effect from "effect/Effect";
import {
  FileSystem,
  NodeServicesLive,
  pathExists,
  YamlParser,
} from "../internal-services.js";

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface ParsedSkill {
  /** Absolute path to the SKILL.md file. */
  skillMdPath: string;
  /** Absolute path to the skill folder (parent of SKILL.md). */
  skillDir: string;
  frontmatter: SkillFrontmatter;
  /** Raw markdown body (after frontmatter). */
  body: string;
  /** Total lines in SKILL.md (including frontmatter). */
  totalLines: number;
  /** Relative paths referenced from SKILL.md (markdown links + script paths). */
  references: string[];
  /** Subset of references that don't exist on disk. */
  missingReferences: string[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export async function parseSkillMd(skillMdPath: string): Promise<ParsedSkill> {
  return Effect.runPromise(parseSkillMdEffect(skillMdPath).pipe(Effect.provide(NodeServicesLive)));
}

export function parseSkillMdEffect(
  skillMdPath: string,
): Effect.Effect<ParsedSkill, unknown, FileSystem | YamlParser> {
  return Effect.gen(function* () {
  const skillDir = dirname(skillMdPath);
  const fs = yield* FileSystem;
  const yaml = yield* YamlParser;
  const raw = yield* fs.readText(skillMdPath);
  const totalLines = raw.split(/\r?\n/).length;

  let frontmatter: SkillFrontmatter = {};
  let body = raw;
  const fmMatch = raw.match(FRONTMATTER_RE);
  if (fmMatch) {
    const parsed = yield* yaml.parse(fmMatch[1]!);
    if (parsed && typeof parsed === "object") {
      frontmatter = parsed as SkillFrontmatter;
    }
    body = raw.slice(fmMatch[0].length);
  }

  const references = extractReferences(body);
  const missingReferences: string[] = [];
  for (const ref of references) {
    const abs = isAbsolute(ref) ? ref : resolvePath(skillDir, ref);
    if (!(yield* pathExists(abs))) missingReferences.push(ref);
  }

  return {
    skillMdPath,
    skillDir,
    frontmatter,
    body,
    totalLines,
    references,
    missingReferences,
  };
  });
}

/**
 * Extract relative paths from a SKILL.md body. Captures:
 *   - Markdown links: [text](path)
 *   - Bare relative paths in code/inline-code: ./foo, ../foo, foo/bar.sh
 * Skips http(s):// URLs.
 */
function extractReferences(body: string): string[] {
  const refs = new Set<string>();
  const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(body)) !== null) {
    const target = m[1]!;
    if (target.startsWith("http://") || target.startsWith("https://")) continue;
    if (target.startsWith("#")) continue;
    refs.add(target);
  }
  // Inline-code relative paths like `./script.sh` or `path/to/file.ext`.
  const codeRe = /`((?:\.{1,2}\/)?[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]{1,5})`/g;
  while ((m = codeRe.exec(body)) !== null) {
    const target = m[1]!;
    if (target.includes("://")) continue;
    refs.add(target);
  }
  return [...refs];
}

export async function fileExists(p: string): Promise<boolean> {
  return Effect.runPromise(pathExists(p).pipe(Effect.provide(NodeServicesLive)));
}

export function joinSkill(skillDir: string, rel: string): string {
  return isAbsolute(rel) ? rel : join(skillDir, rel);
}
