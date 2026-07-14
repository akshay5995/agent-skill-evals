# Agent Skill Evals

Test reusable agent skills with Promptfoo. Agent Skill Evals owns skill-aware setup, static checks, isolated Worlds, evidence, and assertions; Promptfoo remains the runtime and reporting UI.

```sh
pnpm add -D agent-skill-evals promptfoo
pnpm exec agent-skill-evals init --skill ./skills/my-skill --adapter codex
pnpm exec agent-skill-evals check ./skills/my-skill
pnpm exec promptfoo eval
```

The generated Test Pack is plain YAML with a top-level skill and tests. Cases may be behavior or routing tests, single-turn or role-play conversations, and can declare HTTP, command, or MCP mocks that run at their real protocol boundaries.

See [Getting Started](./docs/guide/getting-started.md) and the [Reference](./docs/guide/reference.md).
