# Agent Eval Skills Meta Skill

This repo includes a root skill at `skills/agent-eval-skills`.

Use it when you already have a skill and want an agent to add Agent Skill Evals
coverage for it. The meta skill does not replace Promptfoo. It tells the agent
how to add the normal package setup, Promptfoo configs, runtime tests, fixtures,
and verifier scripts.

Install it with the skills CLI:

```bash
npx skills add akshay5995/agent-skill-evals --skill agent-eval-skills
```

## Problem It Solves

Writing a skill is not the same as proving it works. A useful eval needs a small
example workspace, a Promptfoo test that runs the agent against that workspace,
and evidence checks that show what changed. Without that split, examples become
too hand-wavy and tests become hard to trust.

The meta skill helps an agent add that missing eval harness to an existing
skill. It creates the example inputs, Promptfoo tests, verifier scripts, and
configs needed to run the checks with normal `promptfoo eval` commands.

## Examples Vs Tests

Use these terms consistently:

- An example fixture is the sample workspace or input project the agent edits.
  In this repo those live under `examples/fixtures/`.
- A Promptfoo test pack is the YAML that describes prompts, preconditions,
  expected evidence, and assertions. In this repo those live under
  `examples/tests/`.
- A verifier is a script inside the fixture that fails before the task is done
  and passes after the agent produces the expected result.
- A docs example is a page like this one. It explains the workflow; it is not
  the fixture or the eval test itself.

In a user's project, the same split usually becomes `fixtures/` for example
workspaces and `tests/` for Promptfoo eval cases.

## What It Adds

For a skill such as `skills/release-notes/SKILL.md`, the meta skill guides the
agent to add:

- dev dependencies for `promptfoo` and `agent-skill-evals`
- local loader files under `agent-skill-evals/`
- `promptfoo.skill-checks.yaml`
- an agent config such as `promptfoo.codex.yaml`
- a Promptfoo test pack under `tests/`
- an example fixture and verifier that prove the task through evidence

For MCP workflows, it also guides the agent to add MCP config, loaded-skill
evidence, required and forbidden tool checks, token budget checks, and a
clarification case when the request is missing required inputs.

## The Loop

1. Read the existing skill and package layout.
2. Pick one realistic task.
3. Write a verifier that fails before the task is done.
4. Add Promptfoo configs and runtime tests.
5. Run skill checks first.
6. Run the smallest real-agent eval available.
7. Inspect `evidence.json` before changing the skill or tests.

## Validator

The skill ships with a setup validator:

```bash
node skills/agent-eval-skills/scripts/validate-agent-skill-evals-setup.mjs \
  --skill release-notes \
  --output CHANGELOG.md
```

Use stricter flags for MCP/tool/budget workflows:

```bash
node skills/agent-eval-skills/scripts/validate-agent-skill-evals-setup.mjs \
  --skill incident-triage \
  --agentConfig promptfoo.mcp.codex.yaml \
  --output incident-summary.md \
  --requireMcp \
  --requireSkillLoaded \
  --skillLoadedDelivery mcp \
  --requireToolCalled mcp__incident_ops__get_service_status \
  --requireToolNotCalled mcp__incident_ops__restart_service \
  --requireBudget \
  --requireBudgetsCheck \
  --requireLlmRubric \
  --requireClarificationCase
```

The validator checks the common mistakes that make evals misleading: missing
loaders, missing dependencies, weak runtime test shape, malformed loaded-skill
checks, missing budget assertions, and Codex configs that do not pass prompts
through `-`.

## Repo Layout

- `examples/fixtures/skill-without-evals` starts with a `release-notes` skill
  and no Agent Skill Evals harness. It is an example fixture.
- `examples/fixtures/mcp-workflow-without-evals` starts with an MCP-backed
  `incident-triage` skill and no harness. It is an example fixture.
- `examples/tests/agent-eval-skills.yaml` is a Promptfoo test pack for the
  static authoring path.
- `examples/tests/agent-eval-skills-codex.yaml` checks that Codex can load the
  meta skill over MCP and add the harness to a copied fixture.
- `packages/promptfoo/src/__tests__/agent-eval-skills-validator.test.ts` is a
  package regression test for the validator script.

Run the fast check:

```bash
pnpm run eval:static
```

Run the Codex MCP path when Codex is installed and authenticated:

```bash
pnpm --filter @agent-skill-evals/examples mcp:setup
pnpm run eval:mcp:codex
```
