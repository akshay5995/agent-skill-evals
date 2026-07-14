# agent-skill-evals

Promptfoo-native testing for reusable agent skills.

```sh
npm install --save-dev agent-skill-evals promptfoo
npx agent-skill-evals init --skill ./skills/my-skill --adapter claude-code
npx agent-skill-evals check ./skills/my-skill
npx promptfoo eval
```

Public entry points:

- `agent-skill-evals/agent` — Promptfoo provider
- `agent-skill-evals/assertions` — evidence assertions and budgets
- `agent-skill-evals/test-generator` — clean Test Pack loader

Promptfoo is a peer dependency and remains directly visible to users.
