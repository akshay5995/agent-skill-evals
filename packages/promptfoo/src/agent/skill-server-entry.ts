import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Locate the built-in MCP skill server executable. Published builds resolve
 * dist/mcp/skill-server.mjs next to this module; dev and test runs point
 * AGENT_SKILL_EVALS_SKILL_SERVER at an alternative entry.
 */
export function resolveSkillServerEntry(): string {
  const override = process.env.AGENT_SKILL_EVALS_SKILL_SERVER;
  if (override) return override;
  // The bundler may place this module in dist/agent/ or in a shared chunk at
  // the dist root, so probe both locations relative to the module.
  for (const candidate of ["../mcp/skill-server.mjs", "./mcp/skill-server.mjs"]) {
    const entry = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(entry)) return entry;
  }
  throw new Error(
    "could not locate the built-in MCP skill server (mcp/skill-server.mjs). Build agent-skill-evals or set AGENT_SKILL_EVALS_SKILL_SERVER to the server entry path.",
  );
}
