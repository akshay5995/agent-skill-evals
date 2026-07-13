import { spawn, type ChildProcess } from "node:child_process";
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { MockService } from "../test-pack.js";

interface RunningProcess {
  name: string;
  child: ChildProcess;
  stdout: string;
  stderr: string;
  startedAt: number;
  readyAt?: number;
  stoppedAt?: number;
}

export interface PreparedMockServices {
  env: NodeJS.ProcessEnv;
  args: string[];
  stop(): Promise<void>;
  assertHealthy(): void;
}

const registryKey = Symbol.for("agent-skill-evals.mock-services");
const hooksKey = Symbol.for("agent-skill-evals.mock-service-hooks");
type Registry = Map<string, PreparedMockServices>;
function registry(): Registry {
  const scope = globalThis as typeof globalThis & { [registryKey]?: Registry; [hooksKey]?: boolean };
  const services = scope[registryKey] ??= new Map();
  if (!scope[hooksKey]) {
    scope[hooksKey] = true;
    process.once("beforeExit", () => { void stopAllMockServices(); });
    for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
      process.once(signal, () => { void stopAllMockServices().finally(() => process.exit(code)); });
    }
  }
  return services;
}

async function stopAllMockServices(): Promise<void> {
  const active = [...registry().keys()];
  await Promise.all(active.map(stopMockServices));
}

export async function stopMockServices(runDir: string): Promise<void> {
  const services = registry().get(runDir);
  if (!services) return;
  registry().delete(runDir);
  await services.stop();
}

export function assertMockServicesHealthy(runDir: string): void {
  registry().get(runDir)?.assertHealthy();
}

function append(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length <= 4096 ? next : next.slice(-4096);
}

async function freePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

function resolvedArg(value: string, baseDir: string): string {
  return value.startsWith("./") || value.startsWith("../") ? resolve(baseDir, value) : value;
}

function startProcess(
  mock: Extract<MockService, { kind: "http" }>,
  baseDir: string,
  env: NodeJS.ProcessEnv,
): RunningProcess {
  const child = spawn(mock.command, mock.args.map((arg) => resolvedArg(arg, baseDir)), {
    cwd: baseDir,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const running: RunningProcess = { name: mock.name, child, stdout: "", stderr: "", startedAt: Date.now() };
  child.stdout?.on("data", (chunk) => { running.stdout = append(running.stdout, chunk.toString()); });
  child.stderr?.on("data", (chunk) => { running.stderr = append(running.stderr, chunk.toString()); });
  return running;
}

async function waitUntilReady(
  service: RunningProcess,
  url: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (service.child.exitCode !== null) {
      throw new Error(`Mock Service "${service.name}" exited before readiness (${service.child.exitCode}): ${service.stderr || service.stdout}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        service.readyAt = Date.now();
        return;
      }
    } catch {
      // The service may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`Mock Service "${service.name}" was not ready within ${timeoutMs}ms at ${url}`);
}

function stopProcess(service: RunningProcess): Promise<void> {
  if (service.child.exitCode !== null || service.child.killed) return Promise.resolve();
  return new Promise((resolveStop) => {
    const timer = setTimeout(() => {
      try {
        if (process.platform === "win32") service.child.kill("SIGKILL");
        else if (service.child.pid) process.kill(-service.child.pid, "SIGKILL");
      } catch {
        service.child.kill("SIGKILL");
      }
      service.stoppedAt = Date.now();
      resolveStop();
    }, 1_000);
    service.child.once("exit", () => {
      clearTimeout(timer);
      service.stoppedAt = Date.now();
      resolveStop();
    });
    try {
      if (process.platform === "win32") service.child.kill("SIGTERM");
      else if (service.child.pid) process.kill(-service.child.pid, "SIGTERM");
    } catch {
      service.child.kill("SIGTERM");
    }
  });
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

async function mcpConfigArgs(input: {
  mocks: Array<Extract<MockService, { kind: "mcp" }>>;
  preset?: string;
  runDir: string;
  baseDir: string;
}): Promise<string[]> {
  if (input.mocks.length === 0) return [];
  if (input.preset === "codex") {
    return input.mocks.flatMap((mock) => {
      const prefix = `mcp_servers.${mock.name}`;
      if (mock.transport === "http") return ["-c", `${prefix}.url=${tomlString(mock.url ?? "")}`];
      const command = resolvedArg(mock.command ?? "", input.baseDir);
      return [
        "-c", `${prefix}.command=${tomlString(command)}`,
        "-c", `${prefix}.args=${JSON.stringify(mock.args.map((arg) => resolvedArg(arg, input.baseDir)))}`,
        ...Object.entries(mock.env ?? {}).flatMap(([key, value]) => ["-c", `${prefix}.env.${key}=${tomlString(value)}`]),
      ];
    });
  }

  if (input.preset !== "claude-code") {
    throw new Error("MCP Mock Services currently require the codex or claude-code adapter; Pi has no equivalent built-in MCP config flag");
  }

  const path = join(input.runDir, "mcp-config.json");
  const mcpServers = Object.fromEntries(input.mocks.map((mock) => [
    mock.name,
    mock.transport === "http"
      ? { url: mock.url }
      : {
          command: resolvedArg(mock.command ?? "", input.baseDir),
          args: mock.args.map((arg) => resolvedArg(arg, input.baseDir)),
          ...(mock.env ? { env: mock.env } : {}),
        },
  ]));
  await writeFile(path, JSON.stringify({ mcpServers }, null, 2));
  return ["--mcp-config", path];
}

export async function startMockServices(input: {
  mocks: readonly MockService[];
  runDir: string;
  baseDir: string;
  preset?: string;
  baseArgs: readonly string[];
}): Promise<PreparedMockServices> {
  const env: NodeJS.ProcessEnv = {};
  const running: RunningProcess[] = [];
  const commandBin = join(input.runDir, "mock-bin");
  const mcpMocks: Array<Extract<MockService, { kind: "mcp" }>> = [];

  try {
    for (const mock of input.mocks) {
      if (mock.kind === "command") {
        await mkdir(commandBin, { recursive: true });
        const source = isAbsolute(mock.executable) ? mock.executable : resolve(input.baseDir, mock.executable);
        const destination = join(commandBin, mock.name || basename(source));
        await copyFile(source, destination);
        await chmod(destination, 0o755);
        continue;
      }
      if (mock.kind === "mcp") {
        mcpMocks.push(mock);
        continue;
      }
      const port = await freePort();
      const url = `http://127.0.0.1:${port}`;
      const serviceEnv = {
        ...process.env,
        ...(mock.env ?? {}),
        PORT: String(port),
        AGENT_SKILL_EVALS_MOCK_DIR: join(input.runDir, "mocks", mock.name),
      };
      await mkdir(serviceEnv.AGENT_SKILL_EVALS_MOCK_DIR, { recursive: true });
      const service = startProcess(mock, input.baseDir, serviceEnv);
      running.push(service);
      await waitUntilReady(service, `${url}${mock.ready.path}`, mock.ready.timeout_ms ?? 10_000);
      env[mock.expose_as] = url;
    }
    if (input.mocks.some((mock) => mock.kind === "command")) {
      env.PATH = `${commandBin}:${process.env.PATH ?? ""}`;
    }
    const additions = await mcpConfigArgs({ mocks: mcpMocks, preset: input.preset, runDir: input.runDir, baseDir: input.baseDir });
    const args = [...input.baseArgs];
    const stdin = args.lastIndexOf("-");
    if (stdin >= 0) args.splice(stdin, 0, ...additions);
    else args.push(...additions);
    const prepared: PreparedMockServices = {
      env,
      args,
      assertHealthy() {
        const crashed = running.find((service) => service.readyAt !== undefined && service.child.exitCode !== null && service.stoppedAt === undefined);
        if (crashed) throw new Error(`Mock Service "${crashed.name}" crashed during the run (${crashed.child.exitCode}): ${crashed.stderr || crashed.stdout}`);
      },
      async stop() {
        await Promise.all(running.map(stopProcess));
        await writeFile(join(input.runDir, "mock-services.json"), JSON.stringify(running.map((service) => ({
          name: service.name,
          startedAt: service.startedAt,
          readyAt: service.readyAt,
          stoppedAt: service.stoppedAt,
          exitCode: service.child.exitCode,
          stdout: service.stdout,
          stderr: service.stderr,
        })), null, 2));
      },
    };
    registry().set(input.runDir, prepared);
    return prepared;
  } catch (error) {
    await Promise.all(running.map(stopProcess));
    throw error;
  }
}
