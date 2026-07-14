# agent-skill-evals

Promptfoo-native testing for reusable agent skills with real agents and observable evidence.

Before running an eval, install and authenticate [Codex CLI](https://help.openai.com/en/articles/11096431), [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started), or [Pi](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md). The npm dependencies do not include an agent runtime. For non-interactive Claude evals, export `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` or use `ANTHROPIC_API_KEY`; the isolated runtime cannot reuse a macOS Keychain login.

```sh
npm install --save-dev agent-skill-evals promptfoo
npx agent-skill-evals init --skill ./skills/my-skill --adapter claude-code
npx agent-skill-evals check ./skills/my-skill
npx promptfoo eval
```

`init` creates the Promptfoo wiring and a starter Test Pack. `check` validates the skill and tests without invoking an agent. Promptfoo remains the runtime and reporting UI; Agent Skill Evals creates an isolated World, records evidence, and grades skill-specific assertions.

Public entry points:

- `agent-skill-evals/agent` — Promptfoo provider
- `agent-skill-evals/assertions` — evidence assertions and budgets
- `agent-skill-evals/test-generator` — clean Test Pack loader

Promptfoo is a peer dependency and remains directly visible to users.

See the [Getting Started guide](https://akshay5995.github.io/agent-skill-evals/guide/getting-started) for the first working eval and the [Reference](https://akshay5995.github.io/agent-skill-evals/guide/reference) for Test Packs, runtime checks, mocks, evidence, and budgets.
