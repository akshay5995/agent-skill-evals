import { spawn, type ChildProcess } from "node:child_process";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface CommandRunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
  stdoutLimit?: number;
  stderrLimit?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface CommandRunResult {
  command: string;
  args: string[];
  exitCode: number;
  signal?: NodeJS.Signals;
  stdout: string;
  stderr: string;
  startedAt: number;
  durationMs: number;
  timedOut: boolean;
  error?: Error;
}

const DEFAULT_OUTPUT_LIMIT = 4096;
const KILL_GRACE_MS = 1_000;
const EXIT_STDIO_FLUSH_MS = 50;

interface ProcessRunnerService {
  run(
    command: string,
    args: readonly string[],
    options: CommandRunOptions,
  ): Effect.Effect<CommandRunResult>;
}

export class ProcessRunner extends Context.Tag("agent-skill-evals/promptfoo/ProcessRunner")<
  ProcessRunner,
  ProcessRunnerService
>() {}

function appendLimited(current: string, chunk: string, limit: number): string {
  if (limit <= 0) return "";
  const next = current + chunk;
  return next.length <= limit ? next : next.slice(next.length - limit);
}

function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process may already be gone.
    }
  }
}

export function runCommand(
  command: string,
  args: readonly string[] = [],
  options: CommandRunOptions,
): Promise<CommandRunResult> {
  return Effect.runPromise(
    runCommandEffect(command, args, options).pipe(Effect.provide(ProcessRunnerLive)),
  );
}

export function runCommandEffect(
  command: string,
  args: readonly string[] = [],
  options: CommandRunOptions,
): Effect.Effect<CommandRunResult, never, ProcessRunner> {
  return Effect.flatMap(ProcessRunner, (runner) => runner.run(command, args, options));
}

// This stays custom because it preserves process-group kill, forced timeout,
// and inherited-stdio behavior that platform Command has not been proven to match.
export const ProcessRunnerLive = Layer.succeed(ProcessRunner, {
  run: nodeRunCommandEffect,
});

function nodeRunCommandEffect(
  command: string,
  args: readonly string[],
  options: CommandRunOptions,
): Effect.Effect<CommandRunResult> {
  const stdoutLimit = options.stdoutLimit ?? DEFAULT_OUTPUT_LIMIT;
  const stderrLimit = options.stderrLimit ?? DEFAULT_OUTPUT_LIMIT;

  return Effect.gen(function* () {
  const startedAt = yield* Clock.currentTimeMillis;
  return yield* Effect.async<CommandRunResult>((resume, signal) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let forceTimer: NodeJS.Timeout | null = null;
    let exitFlushTimer: NodeJS.Timeout | null = null;
    let abortListener: (() => void) | null = null;

    const finish = (result: Omit<CommandRunResult, "durationMs">) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceTimer) clearTimeout(forceTimer);
      if (exitFlushTimer) clearTimeout(exitFlushTimer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.stdin?.destroy();
      if (abortListener) signal.removeEventListener("abort", abortListener);
      if (process.platform !== "win32") killProcessGroup(child, "SIGTERM");
      resume(
        Clock.currentTimeMillis.pipe(
          Effect.map((endedAt) => ({
            ...result,
            durationMs: endedAt - startedAt,
          })),
        ),
      );
    };

    abortListener = () => {
      timedOut = true;
      stderr = appendLimited(
        stderr,
        `${stderr ? "\n" : ""}agent-skill-evals: command interrupted`,
        stderrLimit,
      );
      killProcessGroup(child, "SIGKILL");
      finish({
        command,
        args: [...args],
        exitCode: -1,
        signal: "SIGKILL",
        stdout,
        stderr,
        startedAt,
        timedOut,
      });
    };
    signal.addEventListener("abort", abortListener, { once: true });

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout = appendLimited(stdout, text, stdoutLimit);
      options.onStdout?.(text);
    });

    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString();
      stderr = appendLimited(stderr, text, stderrLimit);
      options.onStderr?.(text);
    });

    child.on("error", (error) => {
      stderr = appendLimited(stderr, String(error), stderrLimit);
      finish({
        command,
        args: [...args],
        exitCode: -1,
        stdout,
        stderr,
        startedAt,
        timedOut,
        error,
      });
    });

    child.on("exit", (code, signal) => {
      const result = {
        command,
        args: [...args],
        exitCode: code ?? -1,
        signal: signal ?? undefined,
        stdout,
        stderr,
        startedAt,
        timedOut,
      };
      exitFlushTimer = setTimeout(() => finish(result), EXIT_STDIO_FLUSH_MS);
    });

    child.on("close", (code, signal) => {
      finish({
        command,
        args: [...args],
        exitCode: code ?? -1,
        signal: signal ?? undefined,
        stdout,
        stderr,
        startedAt,
        timedOut,
      });
    });

    if (options.stdin !== undefined) {
      child.stdin?.write(options.stdin);
    }
    child.stdin?.end();

    if (options.timeoutMs) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        stderr = appendLimited(
          stderr,
          `${stderr ? "\n" : ""}agent-skill-evals: command timed out after ${options.timeoutMs}ms`,
          stderrLimit,
        );
        killProcessGroup(child, "SIGKILL");
        forceTimer = setTimeout(() => {
          finish({
            command,
            args: [...args],
            exitCode: -1,
            signal: "SIGKILL",
            stdout,
            stderr,
            startedAt,
            timedOut,
          });
        }, KILL_GRACE_MS);
      }, options.timeoutMs);
    }
  });
  });
}
