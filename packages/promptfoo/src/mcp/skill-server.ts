#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildSkillServer, scanSkills } from "./server.js";

async function main(): Promise<void> {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error("usage: agent-skill-evals-skill-server <skill-dir> [<skill-dir>...]");
    process.exit(2);
  }
  const skills = await scanSkills(dirs);
  const server = buildSkillServer(skills);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(`agent-skill-evals-skill-server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
