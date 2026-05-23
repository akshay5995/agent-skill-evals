# agent-skill-evals

`agent-skill-evals` is the Promptfoo package for testing reusable agent skills.

It gives Promptfoo:

- a Skill Checks provider for `SKILL.md` files and their tests
- an agent provider that runs a CLI-backed agent in a copied sample project
- JavaScript assertions that check recorded evidence

Promptfoo stays the runner. Keep using `promptfoo eval`.

## Install

```bash
pnpm add -D promptfoo agent-skill-evals
```

## Public Entrypoints

The package exposes three Promptfoo-facing subpaths:

- `agent-skill-evals/skill-checks`
- `agent-skill-evals/agent`
- `agent-skill-evals/assertions`

There is no root import from `agent-skill-evals`.

## Loader Files

Create loader files in your project so Promptfoo can import the package with `file://` paths:

```js
// agent-skill-evals/skill-checks.js
export { default } from "agent-skill-evals/skill-checks";
```

```js
// agent-skill-evals/agent.js
export { default } from "agent-skill-evals/agent";
```

```js
// agent-skill-evals/assertions.js
export { default } from "agent-skill-evals/assertions";
export * from "agent-skill-evals/assertions";
```

## Two Checks

Use `skill.checks` before runtime. It answers: is this skill and test setup ready for an agent run?

```yaml
providers:
  - id: file://./agent-skill-evals/skill-checks.js

tests:
  - vars:
      skillPath: ./skills/bugfix-workflow
      testsGlob: ./tests/bugfix-workflow.yaml
    assert:
      - type: javascript
        metric: skill.checks
        value: file://./agent-skill-evals/assertions.js
        config:
          metric: skill.checks
```

Use `skill.test` after an agent run. It answers: did the copied sample project and recorded evidence prove the expected behavior?

```yaml
providers:
  - id: file://./agent-skill-evals/agent.js
    config:
      adapter: codex-json
      command: codex
      args:
        - exec
        - --json
        - "-"

tests:
  - description: fixes login redirect locally
    vars:
      prompt: Fix the login redirect bug.
      fixture: ./fixtures/login-bug
      should:
        - verifier.succeeds:
            run: ./verify_login_redirect.sh
      should_not:
        - file.changes_outside_scope:
            scope:
              - app.js
    assert:
      - type: javascript
        metric: skill.test
        value: file://./agent-skill-evals/assertions.js
        config:
          metric: skill.test
```

## Metrics

- `skill.checks`: runs the full pre-runtime Skill Checks set.
- `skill.test`: checks `preconditions`, `should`, and `should_not` against runtime evidence.
- `skill.budget`: checks real-agent token usage after an agent run.
- `skill.activation`: checks whether the skill describes when it should be used.
- `skill.budgets`: checks whether tests declare token budgets when required.
- `skill.context`: checks referenced files and skill size.
- `skill.instructions`: checks safety instructions for risky work.
- `skill.tests`: checks test validity and negative coverage.
- `skill.verifiers`: checks sample projects and verifier scripts.

## Docs

- [Getting Started](https://akshay5995.github.io/agent-skill-evals/guide/getting-started)
- [Promptfoo Setup](https://akshay5995.github.io/agent-skill-evals/guide/promptfoo-setup)
- [Runtime Checks](https://akshay5995.github.io/agent-skill-evals/guide/runtime-checks)
- [Metrics](https://akshay5995.github.io/agent-skill-evals/guide/metrics)
- [Package Map](https://akshay5995.github.io/agent-skill-evals/guide/package-map)
- [Promptfoo Docs](https://www.promptfoo.dev/docs/intro/)
