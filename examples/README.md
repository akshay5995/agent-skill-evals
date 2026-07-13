# Cross-adapter example

This workspace runs the same behavioral Test Pack against installed Codex, Claude Code, and Pi CLIs.

```sh
pnpm run eval:real
```

The script skips unavailable CLIs. Use `pnpm run eval:codex`, `eval:claude`, or `eval:pi` to run one adapter. Real Claude runs require `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`.

For pull requests, copy [`ci/agent-skill-evals.yml`](./ci/agent-skill-evals.yml) into `.github/workflows/` to run strict static checks without agent credentials.
