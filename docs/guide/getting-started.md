# Getting Started

This guide sets up the smallest useful Agent Skill Evals project.

Agent Skill Evals tests reusable agent skills through Promptfoo. Promptfoo runs the eval. Agent Skill Evals provides the skill-specific checks.

The path is:

1. Install Agent Skill Evals and [Promptfoo](https://www.promptfoo.dev/).
2. Add three small files that let Promptfoo load Agent Skill Evals.
3. Check a `SKILL.md` file and its tests.
4. Run an agent on a copied sample project.

## Install

```bash
pnpm add -D promptfoo agent-skill-evals
```

::: tip Promptfoo is the test runner
[Promptfoo](https://www.promptfoo.dev/) is the eval framework that reads the YAML configs and runs `promptfoo eval`. Agent Skill Evals adds skill-focused checks that Promptfoo can load. Keep the [Promptfoo configuration guide](https://www.promptfoo.dev/docs/configuration/guide/) open if you want the full Promptfoo reference.
:::

Agent Skill Evals runs inside Promptfoo. Keep using `promptfoo eval`; the files below let Promptfoo load Agent Skill Evals.

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

## Run Two Kinds Of Tests

Use **Skill Checks** before an agent runs.

They exist because a broken skill file or a weak test can make the agent result misleading. They check the `SKILL.md` file, referenced files, sample projects, verifier scripts, and safety coverage.

Use **agent tests** after the setup is ready.

They exist because task success should be proven by evidence, not by the agent saying it is done. Agent Skill Evals copies the sample project, runs the agent in the copy, records evidence, and `skill.test` checks that evidence.

Most projects run both, in this order:

```bash
promptfoo eval -c promptfoo.skill-checks.yaml
promptfoo eval -c promptfoo.codex.yaml
```

## 1. Check A Skill And Its Tests

Skill Checks answer: is this skill ready to test with an agent?

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

This catches setup problems before the agent runs: unclear activation text, missing referenced files, invalid checks, missing sample projects, missing verifier scripts, and missing safety coverage.

## 2. Run An Agent Test

Agent tests answer: did the skill produce the expected result in a copied sample project?

Each agent test usually has:

- `prompt`: what the agent should do.
- `fixture`: the sample project to copy. The field is named `fixture` because that is the test variable Agent Skill Evals reads.
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

Agent Skill Evals never edits the original sample project. It copies the folder and checks the copy.

After the run, Agent Skill Evals saves evidence from the copy. The `should` checks describe what the evidence must show. The `should_not` checks describe what the evidence must not show.

## Next

- [Core Concepts](/guide/core-concepts)
- [Promptfoo Setup](/guide/promptfoo-setup)
- [Runtime Checks](/guide/runtime-checks)
- [Brand Deck Example](/examples/brand-deck-skill)
- [Bugfix Example](/examples/bugfix-skill)
