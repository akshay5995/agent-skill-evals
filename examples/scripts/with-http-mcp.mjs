#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";

const command = process.argv[2];
const args = process.argv.slice(3);

if (!command) {
  console.error("Usage: node scripts/with-http-mcp.mjs <command> [...args]");
  process.exit(2);
}

const host = process.env.AGENT_SKILL_EVALS_MCP_HOST ?? "127.0.0.1";
const port = process.env.AGENT_SKILL_EVALS_MCP_PORT
  ? Number(process.env.AGENT_SKILL_EVALS_MCP_PORT)
  : await availablePort(host);
const url = process.env.AGENT_SKILL_EVALS_MCP_URL ?? `http://${host}:${port}/mcp/`;
const examplesDir = process.env.AGENT_SKILL_EVALS_EXAMPLES_DIR ?? process.cwd();

const server = spawn(
  "uv",
  [
    "run",
    "--project",
    "mcp",
    "fastmcp",
    "run",
    "mcp/skill_server.py",
    "--transport",
    "streamable-http",
    "--host",
    host,
    "--port",
    String(port),
    "--path",
    "/mcp/",
    "--no-banner",
  ],
  {
    cwd: examplesDir,
    env: {
      ...process.env,
      AGENT_SKILL_EVALS_EXAMPLES_DIR: examplesDir,
      AGENT_SKILL_EVALS_MCP_SKILLS: process.env.AGENT_SKILL_EVALS_MCP_SKILLS ?? "brand-deck,bugfix-workflow,agent-eval-skills",
      AGENT_SKILL_EVALS_MCP_SERVER: process.env.AGENT_SKILL_EVALS_MCP_SERVER ?? "agent_skill_evals",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk.toString();
});

try {
  await waitForServerReady(server, host, port, 15_000);
  const child = spawn(command, args, {
    cwd: examplesDir,
    env: {
      ...process.env,
      AGENT_SKILL_EVALS_EXAMPLES_DIR: examplesDir,
      AGENT_SKILL_EVALS_MCP_URL: url,
    },
    stdio: "inherit",
  });
  const exitCode = await waitForExit(child);
  process.exitCode = exitCode;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (serverLog.trim()) {
    console.error(serverLog.trim());
  }
  process.exitCode = 1;
} finally {
  await stopProcess(server);
}

async function availablePort(hostname) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, hostname, () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("failed to allocate a port"));
      });
    });
  });
}

async function waitForPort(hostname, targetPort, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canConnect(hostname, targetPort)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`MCP server did not listen on ${hostname}:${targetPort} within ${timeoutMs}ms`);
}

async function waitForServerReady(child, hostname, targetPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      child.off("error", fail);
      child.off("exit", onExit);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const onExit = (code, signal) => {
      fail(new Error(`MCP server exited before listening${signal ? ` via ${signal}` : ` with code ${code ?? 1}`}`));
    };

    child.once("error", fail);
    child.once("exit", onExit);
    waitForPort(hostname, targetPort, timeoutMs).then(
      () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      },
      fail,
    );
  });
}

async function canConnect(hostname, targetPort) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port: targetPort });
    socket.setTimeout(250);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

async function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) resolve(1);
      else resolve(code ?? 1);
    });
  });
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
