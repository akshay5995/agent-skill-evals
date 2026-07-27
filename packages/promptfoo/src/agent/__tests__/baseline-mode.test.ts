import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EvidenceCollector } from "../evidence.js";
import { prepareSkillEnvironment } from "../skill-environment.js";

const dirs: string[] = [];

function makeRun() {
  const runDir = mkdtempSync(join(tmpdir(), "agent-skill-evals-baseline-"));
  dirs.push(runDir);
  const worldPath = join(runDir, "world");
  mkdirSync(worldPath, { recursive: true });
  const skillDir = join(runDir, "source-skill", "demo");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: Use when demoing.\n---\n");
  return { runDir, worldPath, skillDir };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function prepare(mode: string, run: ReturnType<typeof makeRun>, evidence: EvidenceCollector) {
  return prepareSkillEnvironment({
    runDir: run.runDir,
    worldPath: run.worldPath,
    vars: { mode, skillPath: run.skillDir },
    baseDir: run.runDir,
    adapter: "claude-code-json",
    preset: "claude-code",
    args: [],
    prompt: "Do the task.",
    evidence,
  });
}

describe("baseline mode", () => {
  it("installs no skills and leaves the prompt untouched", async () => {
    const run = makeRun();
    const evidence = new EvidenceCollector();
    const environment = await prepare("baseline", run, evidence);

    expect(existsSync(join(run.worldPath, ".claude", "skills"))).toBe(false);
    expect(existsSync(join(run.worldPath, ".agents", "skills"))).toBe(false);
    expect(evidence.toSnapshot().skillsAvailable).toEqual([]);
    expect(environment.formatPrompt("Do the task.")).toBe("Do the task.");
  });

  it("behavior mode still installs the skill and invokes it explicitly", async () => {
    const run = makeRun();
    const evidence = new EvidenceCollector();
    const environment = await prepare("behavior", run, evidence);

    expect(existsSync(join(run.worldPath, ".claude", "skills", "demo", "SKILL.md"))).toBe(true);
    expect(evidence.toSnapshot().skillsAvailable).toEqual([
      expect.objectContaining({ skill: "demo", role: "under-test" }),
    ]);
    expect(environment.formatPrompt("Do the task.")).toContain("/demo");
  });
});
