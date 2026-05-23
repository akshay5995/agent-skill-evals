# agent-skill-evals

Agent Skill Evals helps you test agent skills with [Promptfoo](https://www.promptfoo.dev/).

## Install

```bash
pnpm add -D promptfoo agent-skill-evals
```

Use it to:

1. Check a `SKILL.md` file and its tests before you run an agent.
2. Copy a sample project, run an agent in the copy, save evidence, and check what changed.

Agent Skill Evals is a Promptfoo plugin package. Promptfoo is the eval runner:
it reads the YAML configs, runs providers, and calls assertions. Keep using
`promptfoo eval`; Agent Skill Evals adds skill-focused providers and assertions
that Promptfoo can load from `file://` paths.

## Add Agent Skill Evals To Promptfoo

Create a `agent-skill-evals/` folder in your project and add small loader files:

```js
// agent-skill-evals/agent.js
export { default } from "agent-skill-evals/agent";
```

```js
// agent-skill-evals/skill-checks.js
export { default } from "agent-skill-evals/skill-checks";
```

```js
// agent-skill-evals/assertions.js
export { default } from "agent-skill-evals/assertions";
export * from "agent-skill-evals/assertions";
```

Use these files from normal Promptfoo configs with `file://./agent-skill-evals/...`.

## Entrypoints

The package uses Promptfoo-facing subpaths:

- `agent-skill-evals/agent`
- `agent-skill-evals/skill-checks`
- `agent-skill-evals/assertions`

There is no root import from `agent-skill-evals`.

## Metrics

- `skill.checks` checks a skill file and its tests before an agent runs.
- `skill.test` checks evidence after an agent run.
- `skill.budget` checks real-agent token usage after an agent run.
- `skill.activation`, `skill.budgets`, `skill.context`, `skill.instructions`, `skill.tests`, and `skill.verifiers` run focused Skill Checks.

## Example: Check A Skill Before Runtime

Use `skill.checks` to check that a `SKILL.md` file and its tests are ready to
run:

```yaml
description: Skill checks

prompts:
  - "skill-check"

providers:
  - id: file://./agent-skill-evals/skill-checks.js

tests:
  - description: bugfix skill checks
    vars:
      skillPath: ./skills/bugfix-workflow
      testsGlob: ./tests/bugfix-workflow.yaml
    assert:
      - type: javascript
        metric: skill.checks
        value: file://./agent-skill-evals/assertions.js
        config:
          metric: skill.checks
```

Run it with Promptfoo:

```bash
promptfoo eval -c promptfoo.skill-checks.yaml
```

## Example: Test A Skill On A Copied Project

Use `skill.test` when you want the agent to work on a copied fixture and then
check the evidence from that run:

```yaml
description: Runtime skill test

prompts:
  - "{{prompt}}"

providers:
  - id: file://./agent-skill-evals/agent.js
    config:
      command: codex
      args:
        - exec
        - --json
        - --full-auto

tests:
  - description: fixes login redirect locally
    vars:
      prompt: Fix the login redirect bug.
      fixture: ./fixtures/login-bug
      preconditions:
        - verifier.fails:
            run: ./verify_login_redirect.sh
      should:
        - verifier.succeeds:
            run: ./verify_login_redirect.sh
        - file.contains:
            path: app.js
            text: /dashboard
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

Run it with Promptfoo:

```bash
promptfoo eval -c promptfoo.codex.yaml
```

Agent Skill Evals copies `fixture` before the agent runs. The original sample project
stays clean, and `skill.test` checks the recorded evidence: changed files,
command results, tool calls, final output, usage, and run details.

## Docs

- [Getting Started](https://github.com/akshay5995/agent-skill-evals/blob/main/docs/guide/getting-started.md)
- [Promptfoo Setup](https://github.com/akshay5995/agent-skill-evals/blob/main/docs/guide/promptfoo-setup.md)
- [Runtime Checks](https://github.com/akshay5995/agent-skill-evals/blob/main/docs/guide/runtime-checks.md)
- [Brand Deck Example](https://github.com/akshay5995/agent-skill-evals/blob/main/docs/examples/brand-deck-skill.md)
- [Metrics](https://github.com/akshay5995/agent-skill-evals/blob/main/docs/guide/metrics.md)
