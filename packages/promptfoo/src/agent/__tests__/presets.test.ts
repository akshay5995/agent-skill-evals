import { describe, expect, it } from "vitest";
import {
  AGENT_PRESETS,
  PRESET_IDS,
  presetStalenessHint,
  resolveInvocation,
} from "../presets.js";
import { AgentSkillEvalsProvider } from "../index.js";
import { decodeProviderConfig } from "../provider-config.js";

describe("resolveInvocation", () => {
  it("fills adapter, command, and args from a preset", () => {
    const resolved = resolveInvocation({ preset: "claude-code" });
    expect(resolved).toEqual({
      adapter: "claude-code-json",
      command: "claude",
      args: AGENT_PRESETS["claude-code"]!.args,
      preset: "claude-code",
    });
  });

  it("lets explicit fields override the preset", () => {
    const resolved = resolveInvocation({
      preset: "codex",
      command: "node",
      args: ["stub.mjs"],
    });
    expect(resolved).toMatchObject({
      adapter: "codex-json",
      command: "node",
      args: ["stub.mjs"],
    });
  });

  it("appends extraArgs after preset args", () => {
    const resolved = resolveInvocation({
      preset: "claude-code",
      extraArgs: ["--mcp-config", "./mcp/claude-http.mcp.json"],
    });
    if ("error" in resolved) throw new Error(resolved.error);
    expect(resolved.args?.slice(-2)).toEqual([
      "--mcp-config",
      "./mcp/claude-http.mcp.json",
    ]);
  });

  it("keeps a trailing stdin marker last when inserting extraArgs", () => {
    const resolved = resolveInvocation({
      preset: "codex",
      extraArgs: ["-c", "mcp_servers.example.url=http://localhost"],
    });
    if ("error" in resolved) throw new Error(resolved.error);
    expect(resolved.args?.[resolved.args.length - 1]).toBe("-");
    expect(resolved.args?.slice(-3, -1)).toEqual([
      "-c",
      "mcp_servers.example.url=http://localhost",
    ]);
  });

  it("rejects unknown presets with the supported list", () => {
    const resolved = resolveInvocation({ preset: "cursor" });
    expect(resolved).toMatchObject({
      error: expect.stringContaining(PRESET_IDS.join(", ")),
    });
  });

  it("passes through explicit config untouched when no preset is set", () => {
    const resolved = resolveInvocation({
      adapter: "pi-json",
      command: "pi",
      args: ["--mode", "json"],
    });
    expect(resolved).toEqual({
      adapter: "pi-json",
      command: "pi",
      args: ["--mode", "json"],
    });
  });

  it("appends extraArgs to explicit args when no preset is set", () => {
    const resolved = resolveInvocation({
      adapter: "pi-json",
      command: "pi",
      args: ["--mode", "json"],
      extraArgs: ["--verbose"],
    });
    expect(resolved).toEqual({
      adapter: "pi-json",
      command: "pi",
      args: ["--mode", "json", "--verbose"],
    });
  });
});

describe("presetStalenessHint", () => {
  it("mentions the tested CLI range for a known preset", () => {
    expect(presetStalenessHint("codex")).toContain("Codex CLI");
  });
});

describe("AgentSkillEvalsProvider preset config", () => {
  it("keeps parsed config arrays mutable at runtime", () => {
    const config = decodeProviderConfig({
      adapter: "codex-json",
      command: "codex",
      args: ["exec"],
      skillEvidence: { mcpTool: { toolPatterns: ["^load_(.+)$"] } },
    });
    if ("error" in config) throw new Error(config.error);
    expect(Object.isFrozen(config.args)).toBe(false);
    expect(Object.isFrozen(config.skillEvidence?.mcpTool?.toolPatterns)).toBe(false);
  });

  it("reports unknown presets as a config error", async () => {
    const provider = new AgentSkillEvalsProvider({
      config: { preset: "cursor" },
    });
    const response = await provider.callApi("fix it", {
      vars: { fixture: "." },
    });
    expect(response.error).toMatch(/unknown preset "cursor"/);
  });

  it("guides toward presets when the config is unreadable", async () => {
    const provider = new AgentSkillEvalsProvider({
      config: { timeoutMs: "soon" } as never,
    });
    const response = await provider.callApi("fix it", {
      vars: { fixture: "." },
    });
    expect(response.error).toMatch(/could not be read/);
    expect(response.error).toMatch(/known keys/);
  });
});
