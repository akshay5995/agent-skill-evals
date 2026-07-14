import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { adapterRegistry, type Adapter, type AdapterRunResult } from "./adapters.js";
import { EvidenceCollector } from "./evidence.js";
import { expandEnvVars, resolveConfiguredPath } from "./invocation.js";
import type { PreparedRun } from "./index.js";
import type { ProviderConfig } from "./provider-config.js";
import { resolveInvocation } from "./presets.js";

/**
 * Build the one-shot simulated-user runner. It defaults to the same CLI as
 * the agent under test (already installed and authenticated), runs in an
 * empty directory under the run dir so it cannot touch the world, and uses a
 * throwaway evidence collector so its activity never enters run evidence.
 */
export async function makeSimulatedUserRunner(input: {
  run: PreparedRun;
  config: ProviderConfig;
  agent: { adapter: Adapter; command: string; args: readonly string[] };
  baseDir: string;
  env: NodeJS.ProcessEnv;
}): Promise<{ run: (prompt: string) => Promise<AdapterRunResult> } | { error: string }> {
  const configured = input.config.simulatedUser;
  let adapter = input.agent.adapter;
  let command = input.agent.command;
  let args: readonly string[] = input.agent.args;
  if (configured && (configured.preset || configured.adapter || configured.command)) {
    const resolved = resolveInvocation(configured);
    if ("error" in resolved) {
      return { error: `agent-skill-evals-provider: config.simulatedUser: ${resolved.error}` };
    }
    const simAdapter = resolved.adapter ? adapterRegistry.get(resolved.adapter) : undefined;
    if (!simAdapter || !resolved.command) {
      return {
        error:
          "agent-skill-evals-provider: config.simulatedUser needs a preset or an adapter + command",
      };
    }
    adapter = simAdapter;
    command = resolveConfiguredPath(input.baseDir, expandEnvVars(resolved.command, input.env));
    args = (resolved.args ?? []).map((arg) =>
      resolveConfiguredPath(input.baseDir, expandEnvVars(arg, input.env)),
    );
  }

  const simDir = join(input.run.runDir, "simulated-user");
  try {
    await mkdir(simDir, { recursive: true });
  } catch (err) {
    return {
      error: `agent-skill-evals-provider: failed to create simulated-user directory: ${String(err)}`,
    };
  }
  const timeoutMs = input.config.simulatedUser?.timeoutMs ?? input.config.timeoutMs ?? 5 * 60_000;
  return {
    run: (prompt: string) =>
      adapter.run({
        command,
        args,
        cwd: simDir,
        prompt,
        evidence: new EvidenceCollector(),
        timeoutMs,
        env: input.env,
      }),
  };
}
