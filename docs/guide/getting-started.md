# Getting Started

This guide sets up the smallest useful Agent Skill Evals project.

You will:

1. Install Agent Skill Evals and [Promptfoo](https://www.promptfoo.dev/).
2. Add three small files that let Promptfoo load Agent Skill Evals.
3. Check a `SKILL.md` file and its tests.
4. Run an agent on a copied sample project.

## Install

```bash
pnpm add -D promptfoo agent-skill-evals
```

::: tip Promptfoo is the test runner
[Promptfoo](https://www.promptfoo.dev/) is the eval framework that reads the YAML configs and runs `promptfoo eval`. Agent Skill Evals adds skill-focused providers and assertions that Promptfoo can load.
:::

Agent Skill Evals runs inside Promptfoo. Keep using `promptfoo eval`; the Agent Skill Evals files
below give Promptfoo the providers and assertions it needs.

## Add The Agent Skill Evals Files

Create a `agent-skill-evals/` folder with these files:

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

## Choose A Test Type

Use **Skill Checks** to review a `SKILL.md` file and its Promptfoo tests before an agent runs. They are fast and catch setup problems.

Use **agent tests** when you want proof that the skill works on a sample project. Agent Skill Evals copies the sample project first, so the original stays clean.

Agent tests save evidence: changed files, command results, recorded tool calls, final output, and run details. `skill.test` checks that evidence.

Most projects run both:

```bash
promptfoo eval -c promptfoo.skill-checks.yaml
promptfoo eval -c promptfoo.codex.yaml
```

## Check A Skill And Its Tests

Create a Promptfoo config like this:

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

`skillPath` points to the skill folder. `testsGlob` points to the tests for that skill.

This check catches problems before runtime: unclear activation text, missing referenced files, invalid checks, missing fixtures, missing verifier scripts, and missing safety coverage.

## Run An Agent Test

Each agent test usually has:

- `prompt`: what the agent should do.
- `fixture`: the sample project to copy.
- `preconditions`: checks that run before the agent.
- `should`: checks that must pass after the agent.
- `should_not`: things that must not happen.

```yaml
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

Agent Skill Evals never edits the original `fixture` folder. It copies the folder and checks the copy.

After the run, Agent Skill Evals saves evidence from the copy. The `should` checks describe what the evidence must show. The `should_not` checks describe what the evidence must not show.

## Next

- [Promptfoo Setup](/guide/promptfoo-setup)
- [Core Concepts](/guide/core-concepts)
- [Runtime Checks](/guide/runtime-checks)
- [Brand Deck Example](/examples/brand-deck-skill)
- [Bugfix Example](/examples/bugfix-skill)
