<p align="center">
  <img src="docs/public/assets/agent-skill-evals-readme-banner.png" alt="Agent Skill Evals: Test agent skills with Promptfoo" width="100%">
</p>

# Agent Skill Evals

Agent Skill Evals helps you test agent skills with [Promptfoo](https://www.promptfoo.dev/).

Use it to check three things:

- Is the skill clear enough for an agent to use at the right time?
- Are the tests for the skill valid?
- Does the skill work on a real sample project?

Agent Skill Evals gives you one package: `agent-skill-evals`.

It can:

1. Check a `SKILL.md` file and its tests before you run an agent.
2. Copy a sample project, run an agent in the copy, save evidence, and check what changed.

## Install

```bash
pnpm add -D promptfoo agent-skill-evals
```

Run Agent Skill Evals from normal [Promptfoo](https://www.promptfoo.dev/) configs. Promptfoo is the eval runner; Agent Skill Evals adds skill-focused providers, assertions, examples, and evidence checks. You do not need a new runner.

## Add Agent Skill Evals To Promptfoo

Create a `agent-skill-evals/` folder in your project with these three files:

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

## 1. Check The Skill And Its Tests

Use `skill.checks` to review a skill before an agent runs. It catches common problems like unclear activation text, missing files, invalid tests, missing fixtures, missing verifier scripts, and unsafe file changes.

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

## 2. Test The Skill On A Sample Project

This test copies `./fixtures/login-bug`, runs the agent in the copy, then checks the result.

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

This test checks that:

1. The login project starts broken.
2. The check script fails before the agent runs.
3. The agent is asked to fix the bug.
4. The check script passes after the agent runs.
5. Only `app.js` changed.

Agent Skill Evals records evidence during the run: changed files, command results, recorded tool calls, final output, and run details. `skill.test` checks that evidence.

## Learn More

- [Getting Started](https://akshay5995.github.io/agent-skill-evals/guide/getting-started)
- [Promptfoo Setup](https://akshay5995.github.io/agent-skill-evals/guide/promptfoo-setup)
- [Core Concepts](https://akshay5995.github.io/agent-skill-evals/guide/core-concepts)
- [Runtime Checks](https://akshay5995.github.io/agent-skill-evals/guide/runtime-checks)
- [Brand Deck Example](https://akshay5995.github.io/agent-skill-evals/examples/brand-deck-skill)
- [Bugfix Example](https://akshay5995.github.io/agent-skill-evals/examples/bugfix-skill)
- [Metrics](https://akshay5995.github.io/agent-skill-evals/guide/metrics)
- [Package Map](https://akshay5995.github.io/agent-skill-evals/guide/package-map)
