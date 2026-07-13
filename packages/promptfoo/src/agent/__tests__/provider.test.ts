import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentSkillEvalsProvider } from "../index.js";
import skillTest from "../../assertions/skill-test.js";

describe("AgentSkillEvalsProvider", () => {
  it("grades routing from observed MCP skill-load evidence", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-provider-"));
    const skill = join(dir, "skills", "demo");
    const agent = join(dir, "routing-agent.mjs");
    mkdirSync(skill, { recursive: true });
    writeFileSync(join(skill, "SKILL.md"), "---\nname: demo\ndescription: Use when testing demo routing. Do not use otherwise.\n---\n\nHandle the demo.\n");
    writeFileSync(
      agent,
      [
        "console.log(JSON.stringify({ type: 'item.completed', item: { type: 'mcp_tool_call', server: 'agent_skill_evals', tool: 'read_mcp_resource', arguments: { uri: 'skill://demo/SKILL.md' }, result: 'ok' } }));",
        "console.log(JSON.stringify({ type: 'agent_message', message: 'done' }));",
      ].join("\n"),
    );

    try {
      const provider = new AgentSkillEvalsProvider({
        config: { adapter: "codex-json", command: "node", args: [agent], baseDir: dir },
      });
      const assertions = [
        { "skill.loaded": { skills: ["demo"] } },
        { "skill.not_loaded": { skills: ["agent-skill-evals-neutral"] } },
      ];
      const response = await provider.callApi("Choose the right skill", {
        vars: {
          prompt: "Choose the right skill",
          skillPath: "./skills/demo",
          testPackDir: dir,
          mode: "routing",
          builtinDistractor: true,
          expect: assertions,
        },
      });
      const graded = await skillTest(response.output, {
        providerResponse: { metadata: response.metadata },
        vars: { expect: assertions },
      });

      expect(response.error).toBeUndefined();
      expect(graded.pass).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs a command mock through the isolated PATH", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-provider-"));
    const command = join(dir, "mock-deploy");
    const agent = join(dir, "mock-agent.mjs");
    writeFileSync(command, "#!/bin/sh\nprintf DEPLOY_MOCK_OK\n", { mode: 0o755 });
    writeFileSync(
      agent,
      [
        "import { execFileSync } from 'node:child_process';",
        "const value = execFileSync('deploy', { encoding: 'utf8' }).trim();",
        "console.log(JSON.stringify({ type: 'agent_message', message: value }));",
      ].join("\n"),
    );

    try {
      const provider = new AgentSkillEvalsProvider({
        config: { adapter: "codex-json", command: "node", args: [agent], baseDir: dir },
      });
      const response = await provider.callApi("Deploy safely", {
        vars: {
          environment: {
            mocks: [{ name: "deploy", kind: "command", executable: command }],
          },
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.output).toBe("DEPLOY_MOCK_OK");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs fixtureless with hermetic skills and an HTTP Mock Service", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-provider-"));
    const skill = join(dir, "skills", "demo");
    const server = join(dir, "mock-server.mjs");
    const agent = join(dir, "mock-agent.mjs");
    mkdirSync(skill, { recursive: true });
    writeFileSync(join(skill, "SKILL.md"), "---\nname: demo\ndescription: Use when testing the demo. Do not use otherwise.\n---\nReturn the mock value.\n");
    writeFileSync(
      server,
      [
        "import http from 'node:http';",
        "const server = http.createServer((req, res) => {",
        "  if (req.url === '/health') { res.end('ok'); return; }",
        "  res.end('mock-value');",
        "});",
        "server.listen(Number(process.env.PORT), '127.0.0.1');",
      ].join("\n"),
    );
    writeFileSync(
      agent,
      [
        "const value = await fetch(process.env.BILLING_API_URL + '/value').then((r) => r.text());",
        "console.log(JSON.stringify({ type: 'agent_message', message: value }));",
      ].join("\n"),
    );

    try {
      const provider = new AgentSkillEvalsProvider({
        config: { adapter: "codex-json", command: "node", args: [agent], baseDir: dir },
      });
      const response = await provider.callApi("Read the billing value", {
        vars: {
          prompt: "Read the billing value",
          skillPath: "./skills/demo",
          testPackDir: dir,
          mode: "behavior",
          expect: [{ "output.contains": { text: "mock-value" } }],
          environment: {
            mocks: [
              {
                name: "billing-api",
                kind: "http",
                command: "node",
                args: [server],
                ready: { path: "/health", timeout_ms: 5_000 },
                expose_as: "BILLING_API_URL",
              },
            ],
          },
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.output).toBe("mock-value");
      expect(response.metadata?.fixture).toBeUndefined();
      const evidence = JSON.parse(readFileSync(response.metadata?.evidencePath as string, "utf8")) as {
        skillsAvailable: Array<{ skill: string; role: string }>;
        skillsLoaded: Array<{ skill: string; delivery: string }>;
      };
      expect(evidence.skillsAvailable).toContainEqual(expect.objectContaining({ skill: "demo", role: "under-test" }));
      expect(evidence.skillsLoaded).toEqual([]);
      const graded = await skillTest("mock-value", {
        providerResponse: { metadata: response.metadata },
        vars: { expect: [{ "output.contains": { text: "mock-value" } }] },
      });
      expect(graded.pass).toBe(true);
      const lifecycle = JSON.parse(readFileSync(join(response.metadata?.runDir as string, "mock-services.json"), "utf8"));
      expect(lifecycle).toMatchObject([{ name: "billing-api", readyAt: expect.any(Number), stoppedAt: expect.any(Number) }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps MCP mocks away from the simulated user by default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-provider-"));
    const agent = join(dir, "conversation-agent.mjs");
    writeFileSync(
      agent,
      [
        "const prompt = process.argv.at(-1) ?? '';",
        "const hasMock = process.argv.some((arg) => arg.includes('mcp_servers.crm'));",
        "const output = prompt.includes('HUMAN USER') ? (hasMock ? 'LEAKED' : '<<DONE>>') : 'agent reply';",
        "console.log(JSON.stringify({ type: 'agent_message', message: output }));",
      ].join("\n"),
    );

    try {
      const provider = new AgentSkillEvalsProvider({
        config: {
          preset: "codex",
          adapter: "codex-json",
          command: "node",
          args: [agent],
          baseDir: dir,
        },
      });
      const response = await provider.callApi("Start", {
        vars: {
          conversation: {
            maxTurns: 2,
            user: { goal: "Finish after the first reply" },
            simulatedUserAllowMocks: false,
          },
          environment: {
            mocks: [
              {
                name: "crm",
                kind: "mcp",
                transport: "http",
                url: "http://127.0.0.1:9999/mcp",
              },
            ],
          },
        },
      });

      expect(response.error).toBeUndefined();
      const evidence = JSON.parse(readFileSync(response.metadata?.evidencePath as string, "utf8")) as {
        turns: Array<{ role: string }>;
      };
      expect(evidence.turns.filter((turn) => turn.role === "agent")).toHaveLength(1);
      await skillTest(response.output, {
        providerResponse: { metadata: response.metadata },
        vars: { expect: [{ "output.contains": { text: "agent reply" } }] },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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

  it("does not mistake a configured Pi skill for observed loading", async () => {
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
      expect(evidence.skillsLoaded).toEqual([]);
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

  it("does not infer skill loading from custom command flags", async () => {
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
      expect(evidence.skillsLoaded).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reuses one isolated auth home across fresh Worlds", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-provider-"));
    const agent = join(dir, "auth-state-agent.mjs");
    writeFileSync(
      agent,
      [
        "import { existsSync, writeFileSync } from 'node:fs';",
        "import { join } from 'node:path';",
        "const marker = join(process.env.HOME, 'refreshed-auth');",
        "const output = existsSync(marker) ? 'second' : 'first';",
        "writeFileSync(marker, 'refreshed');",
        "console.log(JSON.stringify({ type: 'agent_message', message: output }));",
      ].join("\n"),
    );

    try {
      const provider = new AgentSkillEvalsProvider({
        config: { adapter: "codex-json", command: "node", args: [agent], baseDir: dir },
      });
      const first = await provider.callApi("first", { vars: {} });
      const second = await provider.callApi("second", { vars: {} });

      expect(first.output).toBe("first");
      expect(second.output).toBe("second");
      expect(first.metadata?.worldPath).not.toBe(second.metadata?.worldPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
