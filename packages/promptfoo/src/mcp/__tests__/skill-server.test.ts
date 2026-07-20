import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildSkillServer, scanSkills, SKILL_SERVER_NAME } from "../server.js";

let dir: string;
let demoDir: string;
let plainDir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-mcp-"));
  demoDir = join(dir, "demo");
  mkdirSync(join(demoDir, "reference"), { recursive: true });
  writeFileSync(
    join(demoDir, "SKILL.md"),
    [
      "---",
      "name: demo",
      "description: Use when the user asks for the demo workflow. Do not use for anything else.",
      "---",
      "# demo",
      "",
      "Follow the demo steps.",
    ].join("\n"),
  );
  writeFileSync(join(demoDir, "reference", "notes.md"), "supporting notes\n");
  plainDir = join(dir, "plain");
  mkdirSync(plainDir, { recursive: true });
  writeFileSync(join(plainDir, "SKILL.md"), "# plain\n\nNo frontmatter here.\n");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function connectedClient(dirs: string[]): Promise<Client> {
  const server = buildSkillServer(await scanSkills(dirs));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("scanSkills", () => {
  it("builds manifests with frontmatter descriptions and file listings", async () => {
    const skills = await scanSkills([demoDir, plainDir]);
    expect(skills.map((skill) => skill.name)).toEqual(["demo", "plain"]);
    expect(skills[0]!.description).toMatch(/^Use when the user asks for the demo workflow/);
    expect(skills[0]!.files).toEqual(["SKILL.md", "reference/notes.md"]);
    expect(skills[1]!.description).toBe("Load instructions for the plain skill.");
  });

  it("rejects missing directories and directories without SKILL.md", async () => {
    await expect(scanSkills([join(dir, "nope")])).rejects.toThrow(/does not exist/);
    const empty = join(dir, "empty");
    mkdirSync(empty, { recursive: true });
    await expect(scanSkills([empty])).rejects.toThrow(/no SKILL\.md/);
  });

  it("rejects duplicate skill names", async () => {
    await expect(scanSkills([demoDir, demoDir])).rejects.toThrow(/duplicate skill name/);
  });
});

describe("buildSkillServer", () => {
  it("exposes a load_<name>_skill tool per skill with the frontmatter description", async () => {
    const client = await connectedClient([demoDir, plainDir]);
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(["load_demo_skill", "load_plain_skill", "read_skill_file"]);
    const demo = tools.tools.find((tool) => tool.name === "load_demo_skill");
    expect(demo?.description).toMatch(/^Use when the user asks for the demo workflow/);
    await client.close();
  });

  it("returns SKILL.md plus a file listing from the load tool", async () => {
    const client = await connectedClient([demoDir]);
    const result = await client.callTool({ name: "load_demo_skill", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("# demo");
    expect(text).toContain("skill://demo/reference/notes.md");
    await client.close();
  });

  it("lists and reads skill:// resources", async () => {
    const client = await connectedClient([demoDir]);
    const resources = await client.listResources();
    const uris = resources.resources.map((resource) => resource.uri).sort();
    expect(uris).toEqual(["skill://demo/SKILL.md", "skill://demo/reference/notes.md"]);
    const read = await client.readResource({ uri: "skill://demo/SKILL.md" });
    expect((read.contents[0] as { text: string }).text).toContain("# demo");
    await client.close();
  });

  it("reads supporting files and rejects path traversal via read_skill_file", async () => {
    const client = await connectedClient([demoDir]);
    const ok = await client.callTool({ name: "read_skill_file", arguments: { skill: "demo", path: "reference/notes.md" } });
    expect((ok.content as Array<{ text: string }>)[0]!.text).toBe("supporting notes\n");
    const escape = await client.callTool({ name: "read_skill_file", arguments: { skill: "demo", path: "../plain/SKILL.md" } });
    expect(escape.isError).toBe(true);
    const missing = await client.callTool({ name: "read_skill_file", arguments: { skill: "demo", path: "nope.md" } });
    expect(missing.isError).toBe(true);
    await client.close();
  });
});

describe("skill-server executable", () => {
  it("answers initialize and tools/list over stdio", async () => {
    const entry = join(import.meta.dirname, "..", "skill-server.ts");
    const child = spawn("pnpm", ["exec", "tsx", entry, demoDir], {
      cwd: join(import.meta.dirname, "..", "..", ".."),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const messages: Array<Record<string, unknown>> = [];
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) messages.push(JSON.parse(line) as Record<string, unknown>);
      }
    });
    const send = (message: Record<string, unknown>) => child.stdin.write(`${JSON.stringify(message)}\n`);
    const waitFor = (id: number) => new Promise<Record<string, unknown>>((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for MCP response")), 30_000);
      const poll = setInterval(() => {
        const match = messages.find((message) => message.id === id);
        if (match) {
          clearTimeout(timer);
          clearInterval(poll);
          resolvePromise(match);
        }
      }, 25);
    });

    try {
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "0.0.0" },
        },
      });
      const initialized = await waitFor(1);
      expect((initialized.result as { serverInfo: { name: string } }).serverInfo.name).toBe(SKILL_SERVER_NAME);
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
      const tools = await waitFor(2);
      const names = (tools.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name);
      expect(names).toContain("load_demo_skill");
    } finally {
      child.kill();
    }
  }, 60_000);
});
