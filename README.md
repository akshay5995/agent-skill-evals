<p align="center">
  <img src="docs/public/assets/agent-skill-evals-readme-banner.png" alt="Agent Skill Evals: Test agent skills with Promptfoo" width="100%">
</p>

[![skills.sh](https://skills.sh/b/akshay5995/agent-skill-evals)](https://skills.sh/akshay5995/agent-skill-evals)

# Agent Skill Evals

Agent Skill Evals helps you test reusable agent skills with [Promptfoo](https://www.promptfoo.dev/).

Already have a skill and want tests for it? Install the helper skill, then ask
your agent to set up Agent Skill Evals for your existing skill.

```bash
npx skills add akshay5995/agent-skill-evals --skill agent-eval-skills
```

For example: "Use `agent-eval-skills` to add tests for
`skills/release-notes`." The helper guides the agent to add Promptfoo configs,
runtime tests, verifier scripts, and evidence checks.

It has two jobs:

1. Check the skill setup before an agent runs.
2. Check recorded evidence after an agent runs.

That split matters because a weak test can make a weak skill look good, and an agent's final message is not proof that the right work happened.

## The Model

Use **Skill Checks** to review a `SKILL.md` file and its tests before runtime.

Use **agent tests** to copy a sample project, run an agent in the copy, save evidence, and assert what happened.

Evidence can include changed files, command results, recorded tool calls, loaded skills, output, usage, and run details.

Promptfoo stays the runner. Agent Skill Evals adds Promptfoo providers, assertions, examples, and evidence checks. You keep running `promptfoo eval`.

## Install

```bash
pnpm add -D promptfoo agent-skill-evals
```

## Minimal Setup

Create loader files so Promptfoo can import the package subpaths:

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

Most projects run both checks:

```bash
promptfoo eval -c promptfoo.skill-checks.yaml
promptfoo eval -c promptfoo.codex.yaml
```

## Learn More

- [Getting Started](https://akshay5995.github.io/agent-skill-evals/guide/getting-started)
- [Core Concepts](https://akshay5995.github.io/agent-skill-evals/guide/core-concepts)
- [Promptfoo Setup](https://akshay5995.github.io/agent-skill-evals/guide/promptfoo-setup)
- [Runtime Checks](https://akshay5995.github.io/agent-skill-evals/guide/runtime-checks)
- [Skill Loading](https://akshay5995.github.io/agent-skill-evals/guide/routing-evals)
- [Set Up Tests For An Existing Skill](https://akshay5995.github.io/agent-skill-evals/examples/meta-skill)
- [Metrics](https://akshay5995.github.io/agent-skill-evals/guide/metrics)
- [Package Map](https://akshay5995.github.io/agent-skill-evals/guide/package-map)
- [Promptfoo Docs](https://www.promptfoo.dev/docs/intro/)
