# Set Up Tests For An Existing Skill

Use `agent-eval-skills` when you already have a reusable agent skill and want an
agent to add tests for it.

The helper does not replace Promptfoo. It tells the agent how to add the normal
Agent Skill Evals setup: Promptfoo configs, Skill Checks, runtime tests,
verifier scripts, and evidence assertions.

Install it with the skills CLI:

```bash
npx skills add akshay5995/agent-skill-evals --skill agent-eval-skills
```

Then ask your agent something like:

> Use `agent-eval-skills` to add Agent Skill Evals tests for
> `skills/release-notes`.

## Problem It Solves

Writing a skill is not the same as proving it works. A useful test should show
that the right skill loaded, the agent changed the right files, expected commands
or tools ran, and the final output is backed by evidence.

The helper gives an agent a recipe for adding that missing test harness to an
existing skill. The result still runs through normal `promptfoo eval` commands.

## What It Adds

For a skill such as `skills/release-notes/SKILL.md`, the helper guides the agent
to add:

- dev dependencies for `promptfoo` and `agent-skill-evals`
- local loader files under `agent-skill-evals/`
- `promptfoo.skill-checks.yaml`
- an agent config such as `promptfoo.codex.yaml`
- a runtime test under `tests/`
- a small sample project and verifier that prove the task through evidence

For MCP workflows, it also guides the agent to add MCP config, loaded-skill
evidence, required and forbidden tool checks, token budget checks, and a
clarification case when the request is missing required inputs.

## Files You Will See

The generated setup usually has two important folders:

- `tests/` contains the Promptfoo eval cases: prompts, preconditions, expected
  evidence, and assertions.
- `fixtures/` contains the small sample projects that the agent works on during
  a test. Agent Skill Evals copies these before running the agent, so the source
  samples stay clean.

A verifier is a script inside the sample project that fails before the task is
done and passes after the agent produces the expected result.

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
- `examples/tests/agent-eval-skills.yaml` is a Promptfoo test file for the
  static authoring path.
- `examples/tests/agent-eval-skills-codex.yaml` checks that Codex can load the
  helper skill over MCP and add the harness to a copied sample project.
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
