import { readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseSkillMd } from "../skill-checks/skill.js";

export interface SkillManifest {
  name: string;
  dir: string;
  description: string;
  /** Relative file paths (POSIX separators), SKILL.md first. */
  files: string[];
}

export const SKILL_SERVER_NAME = "agent-skill-evals-skills";

/** Reserved tool name for reading a skill's supporting files; skills cannot use it. */
export const READ_SKILL_FILE_TOOL_NAME = "read_skill_file";

/**
 * Claude Code exposes MCP tools to the model as `mcp__<server>__<tool>` and
 * the Claude API rejects tool names over 64 characters. The built-in skill
 * server always registers under the reserved server name "skills" (6 chars),
 * so `len("mcp__") + len("skills") + len("__")` = 13 chars are already spent
 * before the skill name itself: 64 - 13 = 51.
 */
export const MAX_SKILL_NAME_LENGTH = 51;

function packageVersion(): string {
  try {
    const pkg = createRequire(import.meta.url)("../../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function listFiles(root: string, dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(root, path)));
    else if (entry.isFile()) out.push(relative(root, path).split(sep).join("/"));
  }
  return out.sort();
}

function skillName(dir: string): string {
  return basename(dir.replace(/\/+$/, ""));
}

export async function scanSkills(dirs: readonly string[]): Promise<SkillManifest[]> {
  const skills: SkillManifest[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    const root = resolve(dir);
    const isDir = await stat(root).then((s) => s.isDirectory()).catch(() => false);
    if (!isDir) throw new Error(`skill directory does not exist: ${dir}`);
    const skillMdPath = join(root, "SKILL.md");
    const hasSkillMd = await stat(skillMdPath).then((s) => s.isFile()).catch(() => false);
    if (!hasSkillMd) throw new Error(`skill directory has no SKILL.md: ${dir}`);
    const name = skillName(root);
    if (seen.has(name)) throw new Error(`duplicate skill name: ${name}`);
    if (name.length > MAX_SKILL_NAME_LENGTH) {
      throw new Error(
        `skill name "${name}" is ${name.length} characters; MCP delivery registers it directly as a tool name, and Claude Code's mcp__skills__${name} wrapping must stay within its 64-character limit. Shorten the skill directory name to ${MAX_SKILL_NAME_LENGTH} characters or fewer.`,
      );
    }
    if (name === READ_SKILL_FILE_TOOL_NAME) {
      throw new Error(`skill name "${name}" collides with the reserved ${READ_SKILL_FILE_TOOL_NAME} tool; rename the skill directory.`);
    }
    seen.add(name);
    const parsed = await parseSkillMd(skillMdPath);
    const description = typeof parsed.frontmatter.description === "string" && parsed.frontmatter.description.trim().length > 0
      ? parsed.frontmatter.description.trim()
      : `Load instructions for the ${name} skill.`;
    const files = await listFiles(root, root);
    files.sort((a, b) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b)));
    skills.push({ name, dir: root, description, files });
  }
  return skills;
}

function mimeType(path: string): string {
  return /\.(md|markdown)$/i.test(path) ? "text/markdown" : "text/plain";
}

function resolveSkillFile(skill: SkillManifest, path: string): string | undefined {
  if (isAbsolute(path)) return undefined;
  const resolved = resolve(skill.dir, path);
  if (resolved !== skill.dir && !resolved.startsWith(skill.dir + sep)) return undefined;
  return resolved;
}

async function loadSkillText(skill: SkillManifest): Promise<string> {
  const skillMd = await readFile(join(skill.dir, "SKILL.md"), "utf8");
  const supporting = skill.files.filter((file) => file !== "SKILL.md");
  if (supporting.length === 0) return skillMd;
  const listing = supporting.map((file) => `- skill://${skill.name}/${file}`);
  return `${skillMd}\n\n## Skill files\n\nRead these with the read_skill_file tool or the listed resource URIs:\n${listing.join("\n")}\n`;
}

export function buildSkillServer(skills: readonly SkillManifest[]): McpServer {
  const server = new McpServer({ name: SKILL_SERVER_NAME, version: packageVersion() });
  const byName = new Map(skills.map((skill) => [skill.name, skill]));

  for (const skill of skills) {
    server.registerTool(
      skill.name,
      { description: skill.description },
      async () => ({ content: [{ type: "text", text: await loadSkillText(skill) }] }),
    );
    for (const file of skill.files) {
      server.registerResource(
        `${skill.name}/${file}`,
        `skill://${skill.name}/${file}`,
        { description: file === "SKILL.md" ? skill.description : `${file} from the ${skill.name} skill.`, mimeType: mimeType(file) },
        async (uri) => ({
          contents: [{ uri: uri.href, mimeType: mimeType(file), text: await readFile(join(skill.dir, file), "utf8") }],
        }),
      );
    }
  }

  server.registerTool(
    READ_SKILL_FILE_TOOL_NAME,
    {
      description: "Read a supporting file from a skill by its relative path.",
      inputSchema: { skill: z.string(), path: z.string() },
    },
    async ({ skill: name, path }) => {
      const skill = byName.get(name);
      if (!skill) {
        return { content: [{ type: "text", text: `unknown skill: ${name}` }], isError: true };
      }
      const resolved = resolveSkillFile(skill, path);
      if (!resolved) {
        return { content: [{ type: "text", text: `path escapes the skill directory: ${path}` }], isError: true };
      }
      try {
        return { content: [{ type: "text", text: await readFile(resolved, "utf8") }] };
      } catch {
        return { content: [{ type: "text", text: `skill file does not exist: ${path}` }], isError: true };
      }
    },
  );

  return server;
}
