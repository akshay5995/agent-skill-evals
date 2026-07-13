import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const env = {
  ...process.env,
  PATH: `${homedir()}/.local/bin:${process.env.PATH ?? ""}`,
};

for (const [cli, script] of [
  ["codex", "eval:codex"],
  ["claude", "eval:claude"],
  ["pi", "eval:pi"],
]) {
  const available = spawnSync(cli, ["--version"], { env, stdio: "ignore" }).status === 0;
  if (!available) {
    console.log(`Skipping ${script}: ${cli} CLI not found`);
    continue;
  }

  const result = spawnSync("pnpm", ["run", script], { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
