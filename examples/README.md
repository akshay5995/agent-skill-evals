# Cross-adapter example

This workspace runs the same behavioral Test Pack against installed Codex, Claude Code, and Pi CLIs. Its cases cover a verifier-backed file edit, a scripted multi-turn follow-up, and a command mock at the real `PATH` boundary.

```sh
pnpm run eval:real
```

The script skips unavailable CLIs. Each installed CLI must already be authenticated; follow the official setup for [Codex CLI](https://help.openai.com/en/articles/11096431), [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started), or [Pi](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md). Use `pnpm run eval:codex`, `pnpm run eval:claude`, or `pnpm run eval:pi` to run one adapter. Non-interactive Claude runs require `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`.

When a case fails, inspect the reported `evidence.json` and retained World before relying on Promptfoo's summary alone.

For pull requests, copy [`ci/agent-skill-evals.yml`](./ci/agent-skill-evals.yml) into `.github/workflows/` to run strict static checks without agent credentials.
