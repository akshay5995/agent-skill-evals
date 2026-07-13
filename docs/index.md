---
layout: home
title: Agent Skill Evals

hero:
  name: Agent Skill Evals
  text: Test agent skills with Promptfoo.
  tagline: Check the skill, run the agent in an isolated World, and prove the result with evidence.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Reference
      link: /guide/reference
    - theme: alt
      text: What is Promptfoo?
      link: https://www.promptfoo.dev/

features:
  - title: Scaffold with one command
    details: "`agent-skill-evals init --skill ./skills/my-skill --adapter claude-code` creates the minimal Promptfoo config and a clean starter Test Pack."
  - title: Check the skill first
    details: Find unclear activation text, missing files, and broken tests before you run an agent.
  - title: Prove it with evidence
    details: Assertions read changed files, tool calls, skill loading, token usage, and multi-turn conversations — not the agent's own summary.
---

::: tip Promptfoo is the test runner
[Promptfoo](https://www.promptfoo.dev/) is an open-source eval framework. Agent Skill Evals plugs into normal Promptfoo configs, so you keep running `promptfoo eval` and add skill-specific checks. Use the [Promptfoo docs](https://www.promptfoo.dev/docs/intro/) for Promptfoo's own config reference.
:::

## How It Works

Use `agent-skill-evals check` for cheap static validation, then use `promptfoo eval` to run the agent and grade recorded evidence. There is no separate eval runner.

## What A Test Looks Like

This example checks that an agent fixes the login redirect and only changes the intended file:

```yaml
skill: ../skills/bugfix-workflow
tests:
  - prompt: Fix successful logins so they go to /dashboard.
    fixture: ../fixtures/login-bug
    preconditions:
      - verifier.fails: { run: ./verify_login_redirect.sh }
    expect:
      - verifier.succeeds: { run: ./verify_login_redirect.sh }
      - file.changes_within: { paths: [app.js] }
```

Start with [Getting Started](/guide/getting-started). See the [Reference](/guide/reference) for Test Pack structure and runtime checks, or run the repo's [cross-adapter example](https://github.com/akshay5995/agent-skill-evals/tree/main/examples).
