import { describe, expect, it } from "vitest";
import { EvidenceCollector } from "../evidence.js";

function loadEventsAfter(toolCall: { tool: string; args?: unknown }) {
  const collector = new EvidenceCollector();
  collector.addToolCall({ ...toolCall, startedAt: 1, durationMs: 5 });
  return collector.toSnapshot().skillsLoaded;
}

describe("native skill-load evidence", () => {
  it("records a native load when a file tool reads an installed SKILL.md", () => {
    const events = loadEventsAfter({
      tool: "Read",
      args: { file_path: "/tmp/world/.claude/skills/bugfix-workflow/SKILL.md" },
    });
    expect(events).toEqual([
      expect.objectContaining({
        skill: "bugfix-workflow",
        delivery: "native",
        source: "Read",
      }),
    ]);
  });

  it("records a native load when a shell command reads an installed SKILL.md", () => {
    const events = loadEventsAfter({
      tool: "shell",
      args: { command: ["bash", "-lc", "cat .agents/skills/release-notes/SKILL.md"] },
    });
    expect(events).toEqual([
      expect.objectContaining({ skill: "release-notes", delivery: "native" }),
    ]);
  });

  it("ignores reads of files that are not installed skills", () => {
    expect(loadEventsAfter({ tool: "Read", args: { file_path: "/tmp/world/app.js" } })).toEqual([]);
    expect(loadEventsAfter({ tool: "Read", args: { file_path: "/tmp/world/skills/x/SKILL.md" } })).toEqual([]);
    expect(loadEventsAfter({ tool: "Read", args: { file_path: "/tmp/world/.claude/skills/x/README.md" } })).toEqual([]);
  });

  it("keeps MCP evidence precedence and dedupes repeated loads", () => {
    const collector = new EvidenceCollector();
    collector.addToolCall({
      tool: "resources/read",
      args: { uri: "skill://demo/SKILL.md" },
      startedAt: 1,
      durationMs: 5,
    });
    collector.addToolCall({
      tool: "Read",
      args: { file_path: "/w/.claude/skills/demo/SKILL.md" },
      startedAt: 2,
      durationMs: 5,
    });
    collector.addToolCall({
      tool: "Read",
      args: { file_path: "/w/.claude/skills/demo/SKILL.md" },
      startedAt: 3,
      durationMs: 5,
    });
    const deliveries = collector.toSnapshot().skillsLoaded.map((event) => event.delivery);
    expect(deliveries.filter((delivery) => delivery === "mcp")).toHaveLength(1);
    expect(deliveries.filter((delivery) => delivery === "native")).toHaveLength(1);
  });
});
