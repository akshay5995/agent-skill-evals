---
layout: home
title: Agent Skill Evals

hero:
  name: Agent Skill Evals
  text: Test agent skills with Promptfoo.
  tagline: Check the skill and its tests, then prove the skill works on a copied sample project.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: What is Promptfoo?
      link: https://www.promptfoo.dev/
    - theme: alt
      text: See Example
      link: /examples/brand-deck-skill

features:
  - title: Check the skill first
    details: Find unclear activation text, missing files, broken tests, and unsafe edit rules before you run an agent.
  - title: Keep sample projects clean
    details: Agent Skill Evals copies your sample project first. The agent edits the copy, not your original files.
  - title: Check real evidence
    details: Assertions read changed files, command results, recorded tool calls, output, and run details.
---

## Who Agent Skill Evals Is For

Agent Skill Evals is for teams that write reusable skills for agents.

Use it when a skill can edit files, run commands, call tools, or make changes you want to check before trusting it.

::: tip Promptfoo is the test runner
[Promptfoo](https://www.promptfoo.dev/) is an open-source eval framework. Agent Skill Evals plugs into normal Promptfoo configs, so you keep running `promptfoo eval` and add skill-specific providers, assertions, examples, and evidence checks.
:::

## How It Works

A good skill test is simple:

1. Check the skill and its tests.
2. Start with a known sample project.
3. Ask the agent to do a realistic task.
4. Record evidence: changed files, tool calls, command results, output, and run details.
5. Fail the test if the agent changed something it should not change.

Agent Skill Evals runs that flow through [Promptfoo](https://www.promptfoo.dev/).

## What A Test Looks Like

This example checks that an agent creates a PowerPoint deck and only changes the allowed files:

```yaml
preconditions:
  - verifier.fails:
      run: ./verify_brand_deck.cjs
should:
  - verifier.succeeds:
      run: ./verify_brand_deck.cjs
  - file.created:
      path: launch-deck.pptx
  - file.created:
      path: deck.js
should_not:
  - file.changes_outside_scope:
      scope:
        - deck.js
        - launch-deck.pptx
```

Start with [Getting Started](/guide/getting-started). Then see the [Brand Deck Example](/examples/brand-deck-skill), [Promptfoo Setup](/guide/promptfoo-setup), [Runtime Checks](/guide/runtime-checks), and [Metrics](/guide/metrics).
