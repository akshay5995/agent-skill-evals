import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentSkillEvalsProvider } from "../index.js";

describe("AgentSkillEvalsProvider", () => {
  it("returns a provider error when an adapter emits output but exits non-zero", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-provider-"));
    const fixture = join(dir, "fixture");
    const agent = join(dir, "partial-fail.mjs");
    mkdirSync(fixture);
    writeFileSync(join(fixture, "app.js"), "console.log('fixture');\n");
    writeFileSync(
      agent,
      [
        "console.log(JSON.stringify({ type: 'agent_message', message: 'partial answer' }));",
        "console.error('auth expired');",
        "process.exit(2);",
      ].join("\n"),
    );

    try {
      const provider = new AgentSkillEvalsProvider({
        config: {
          adapter: "codex-json",
          command: "node",
          args: [agent],
          baseDir: dir,
        },
      });
      const response = await provider.callApi("fix it", {
        vars: {
          fixture,
        },
      });

      expect(response.output).toBe("partial answer");
      expect(response.error).toMatch(/auth expired/);
      expect(response.metadata?.evidencePath).toEqual(expect.any(String));
      expect(response.tokenUsage).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    {
      adapter: "codex-json",
      scriptName: "codex-usage.mjs",
      scriptLines: [
        "console.log(JSON.stringify({ type: 'usage', usage: { input_tokens: 12, output_tokens: 5 } }));",
        "console.log(JSON.stringify({ type: 'agent_message', message: 'done' }));",
      ],
    },
    {
      adapter: "claude-code-json",
      scriptName: "claude-usage.mjs",
      scriptLines: [
        "console.log(JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 12, output_tokens: 5 }, content: [] } }));",
        "console.log(JSON.stringify({ type: 'result', result: 'done' }));",
      ],
    },
    {
      adapter: "pi-json",
      scriptName: "pi-usage.mjs",
      scriptLines: [
        "console.log(JSON.stringify({ type: 'message_end', message: { role: 'assistant', usage: { input: 12, output: 5, totalTokens: 17 } } }));",
        "console.log(JSON.stringify({ type: 'final', text: 'done' }));",
      ],
    },
  ])("returns Promptfoo token usage from $adapter evidence", async ({ adapter, scriptName, scriptLines }) => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-provider-"));
    const fixture = join(dir, "fixture");
    const agent = join(dir, scriptName);
    mkdirSync(fixture);
    writeFileSync(join(fixture, "app.js"), "console.log('fixture');\n");
    writeFileSync(agent, scriptLines.join("\n"));

    try {
      const provider = new AgentSkillEvalsProvider({
        config: {
          adapter,
          command: "node",
          args: [agent],
          baseDir: dir,
        },
      });
      const response = await provider.callApi("fix it", {
        vars: {
          fixture,
        },
      });

      expect(response.output).toBe("done");
      expect(response.tokenUsage).toEqual({
        total: 17,
        prompt: 12,
        completion: 5,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records deterministic Pi native skill loading when discovery is disabled", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-provider-"));
    const fixture = join(dir, "fixture");
    const agent = join(dir, "agent.mjs");
    mkdirSync(fixture);
    writeFileSync(join(fixture, "app.js"), "console.log('fixture');\n");
    writeFileSync(
      agent,
      "console.log(JSON.stringify({ type: 'final', text: 'done' }));\n",
    );

    try {
      const provider = new AgentSkillEvalsProvider({
        config: {
          adapter: "pi-json",
          command: "node",
          args: [agent, "--no-skills", "--skill", "./skills/brand-deck"],
          baseDir: dir,
        },
      });
      const response = await provider.callApi("fix it", {
        vars: {
          fixture,
        },
      });

      expect(response.output).toBe("done");
      const evidencePath = response.metadata?.evidencePath;
      expect(evidencePath).toEqual(expect.any(String));
      const evidence = JSON.parse(readFileSync(evidencePath as string, "utf8")) as {
        skillsLoaded: Array<{ skill: string; delivery: string; provider?: string; source?: string }>;
      };
      expect(evidence.skillsLoaded).toMatchObject([
        {
          skill: "brand-deck",
          delivery: "native",
          provider: "pi-json",
          source: "--skill",
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not path-resolve CLI config assignments", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-provider-"));
    const fixture = join(dir, "fixture");
    const agent = join(dir, "agent.mjs");
    mkdirSync(fixture);
    writeFileSync(join(fixture, "app.js"), "console.log('fixture');\n");
    writeFileSync(
      agent,
      [
        "const configArg = process.argv.find((arg) => arg.startsWith('mcp_servers.agent_skill_evals.args='));",
        "console.log(JSON.stringify({ type: 'agent_message', message: configArg ?? '' }));",
      ].join("\n"),
    );

    try {
      const provider = new AgentSkillEvalsProvider({
        config: {
          adapter: "codex-json",
          command: "node",
          args: [agent, 'mcp_servers.agent_skill_evals.args=["mcp/skill_server.py"]'],
          baseDir: dir,
        },
      });
      const response = await provider.callApi("fix it", {
        vars: {
          fixture,
        },
      });

      expect(response.output).toBe('mcp_servers.agent_skill_evals.args=["mcp/skill_server.py"]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("expands env vars in CLI config assignments", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-provider-"));
    const fixture = join(dir, "fixture");
    const agent = join(dir, "agent.mjs");
    mkdirSync(fixture);
    writeFileSync(join(fixture, "app.js"), "console.log('fixture');\n");
    writeFileSync(
      agent,
      [
        "const configArg = process.argv.find((arg) => arg.startsWith('mcp_servers.agent_skill_evals.url='));",
        "console.log(JSON.stringify({ type: 'agent_message', message: configArg ?? '' }));",
      ].join("\n"),
    );

    const previousUrl = process.env.AGENT_SKILL_EVALS_MCP_URL;
    process.env.AGENT_SKILL_EVALS_MCP_URL = "http://127.0.0.1:8765/mcp/";
    try {
      const provider = new AgentSkillEvalsProvider({
        config: {
          adapter: "codex-json",
          command: "node",
          args: [agent, 'mcp_servers.agent_skill_evals.url="${AGENT_SKILL_EVALS_MCP_URL}"'],
          baseDir: dir,
        },
      });
      const response = await provider.callApi("fix it", {
        vars: {
          fixture,
        },
      });

      expect(response.output).toBe('mcp_servers.agent_skill_evals.url="http://127.0.0.1:8765/mcp/"');
    } finally {
      if (previousUrl === undefined) delete process.env.AGENT_SKILL_EVALS_MCP_URL;
      else process.env.AGENT_SKILL_EVALS_MCP_URL = previousUrl;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records configured native skill loading from custom flags", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-provider-"));
    const fixture = join(dir, "fixture");
    const agent = join(dir, "agent.mjs");
    mkdirSync(fixture);
    writeFileSync(join(fixture, "app.js"), "console.log('fixture');\n");
    writeFileSync(agent, "console.log(JSON.stringify({ type: 'agent_message', message: 'done' }));\n");

    try {
      const provider = new AgentSkillEvalsProvider({
        config: {
          adapter: "codex-json",
          command: "node",
          args: [agent, "--only-skills", "--load-skill", "./skills/brand-deck"],
          baseDir: dir,
          skillEvidence: {
            nativeArgs: {
              whenArgs: ["--only-skills"],
              skillPathFlags: ["--load-skill"],
              provider: "custom-json",
              source: "--load-skill",
            },
          },
        },
      });
      const response = await provider.callApi("fix it", {
        vars: {
          fixture,
        },
      });

      expect(response.output).toBe("done");
      const evidencePath = response.metadata?.evidencePath;
      const evidence = JSON.parse(readFileSync(evidencePath as string, "utf8")) as {
        skillsLoaded: Array<{ skill: string; delivery: string; provider?: string; source?: string }>;
      };
      expect(evidence.skillsLoaded).toMatchObject([
        {
          skill: "brand-deck",
          delivery: "native",
          provider: "custom-json",
          source: "--load-skill",
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
