import { isAbsolute, resolve } from "node:path";
import { runCommand } from "./command-runner.js";

export function resolveConfiguredPath(baseDir: string, path: string): string {
  if (path.includes("=")) return path;
  return path.startsWith("./") ||
    path.startsWith("../") ||
    (!isAbsolute(path) && path.includes("/"))
    ? resolve(baseDir, path)
    : path;
}

export function expandEnvVars(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(:-([^}]*))?\}/g, (_match, name: string, _fallbackPart: string, fallback: string | undefined) =>
    env[name] ?? fallback ?? "",
  );
}

/**
 * Best-effort `<command> --version` probe. Records which CLI build produced
 * this run so cross-run comparisons can tell agent updates apart from skill
 * regressions. Failures are silent: not every CLI supports --version.
 */
export async function captureCliVersion(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  try {
    const result = await runCommand(command, ["--version"], {
      cwd,
      env,
      timeoutMs: 5_000,
      stdoutLimit: 1024,
    });
    if (result.error || result.timedOut || result.exitCode !== 0) return undefined;
    const firstLine = result.stdout.trim().split("\n")[0]?.trim();
    return firstLine ? firstLine.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}
