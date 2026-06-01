---
name: agent-eval-skills
description: |
  Use when the user has an existing agent SKILL.md and wants to add
  Promptfoo-native Agent Skill Evals coverage, package setup, runtime fixtures,
  verifier scripts, or Codex/Claude/Pi agent eval configs.

  Do not use for: writing the domain skill from scratch, replacing Promptfoo
  with a custom runner, generic test advice, or judging agent intent without
  observable evidence.
---

# agent-eval-skills

Promise: add a small, runnable Agent Skill Evals harness for an existing skill.

## First Move

Plan first. Read the target skill, package files, existing tests, and fixture
files before editing. Ask at most three short questions only when the repo does
not reveal required details such as MCP server names, allowed tools, forbidden
tools, expected output files, or token budget limits.

Keep Promptfoo as the runner. Add package setup and normal Promptfoo configs;
do not add a custom runner or a root `agent-skill-evals` import.

## Terms And Loop

1. Target skill: the existing skill being evaluated.
2. Example fixture: a small incomplete workspace or input project.
3. Verifier: a local script that fails before the task and passes after it.
4. Runtime test pack: Promptfoo YAML that runs the agent and checks evidence.
5. Run the smallest useful check, inspect evidence on failure, and tighten the
   skill or test instead of weakening the assertion.

## Files To Add

For a target skill such as a release-notes skill file, add:

- local loader files for the agent provider, skill-check provider, and assertions
- a Promptfoo skill-check config
- an agent config for the available CLI, usually Codex first
- a runtime test pack for the target skill
- an example fixture and verifier script for the target skill

Add `promptfoo` and `agent-skill-evals` as dev dependencies using the repo's
package manager. If install commands are blocked, update the package manifest and
tell the user which install command remains.

Loader files should be exactly this shape:

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

## Runtime Test Shape

Each runtime test case should have its own `assert` block and prove behavior
through evidence:

```yaml
- description: target skill performs the task
  vars:
    skill: target-skill
    kind: positive
    fixture: ./fixtures/target-skill
    prompt: "Use the target skill to perform the realistic task."
    preconditions:
      - verifier.fails:
          run: ./verify_target_skill.cjs
    should:
      - verifier.succeeds:
          run: ./verify_target_skill.cjs
      - file.created:
          path: expected-output.md
    should_not:
      - file.changes_outside_scope:
          scope:
            - expected-output.md
  assert:
    - type: javascript
      metric: skill.test
      value: file://./agent-skill-evals/assertions.js
      config:
        metric: skill.test
```

Use `skill`, not `name`. Keep runtime checks under `preconditions`, `should`,
and `should_not`; do not put checks like `file.created` directly in Promptfoo
assertions. Paths are relative to the copied fixture root. Use `scope` for
`file.changes_outside_scope`. Do not add unsupported fields such as `cwd`,
`allowed`, `fixture`, or `metric` inside individual runtime checks.

Every test pack should include at least one positive case and one negative or
boundary case. Do not use `file.created` as a precondition for a file that
already exists; use a failing verifier to prove the start state.

## Skill Loading And Tools

For routing, prove observable skill loading before task success. Use this shape
only when the adapter or MCP server records skill evidence:

```yaml
- skill.loaded:
    delivery: mcp
    should_include:
      - target-skill
```

Do not write `skill.loaded: { name: target-skill }`. If skill loading is not
observable, rely on verifier, file, command, and tool evidence.

Tool checks only inspect recorded adapter evidence. The tool field is `tool`:

```yaml
- tool.called:
    tool: mcp__incident_ops__get_service_status
    server: incident_ops
```

Keep forbidden tool checks under `should` because `tool.not_called` already
means "this must not happen."

## MCP, Budgets, And Clarification

For MCP-backed workflow skills, add an MCP agent config such as
the MCP-specific Codex Promptfoo config, configure the server through env-expanded args, and
add checks for:

- expected skill loading with `delivery: mcp`
- required tool calls
- forbidden tool calls
- output files and scope boundaries

When token use matters, add a `skill.budget` assertion beside every runtime
test assertion and add a static `skill.budgets` check with
`config.agentSkillEvals.requireTokenBudget: true`.

When the correct behavior is to ask a clarifying question, prove the boundary
with no-tool and no-file evidence, then add a native Promptfoo `llm-rubric`
assertion to judge the final text. Do not use an LLM judge as the only proof of
tool use, file changes, skill loading, or budget behavior.

## Validator

After scaffolding, run the bundled validator when available:

```bash
node skills/agent-eval-skills/scripts/validate-agent-skill-evals-setup.mjs \
  --skill release-notes \
  --output CHANGELOG.md
```

For MCP/tool/budget workflows, use stricter flags:

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

If this skill is installed into an agent-specific skills directory, adapt the
script path to that installed location.

## Boundaries

- Do not edit the target skill unless failed evidence shows the instructions are
  too weak or mismatched to the test.
- Do not modify source fixtures except to add verifier scripts or create the
  sample project.
- Do not add fake agent stubs to public examples.
- Do not claim success from final text alone; require evidence.
- Do not fetch remote data unless the skill explicitly needs it and the test
  can make that dependency reliable.
