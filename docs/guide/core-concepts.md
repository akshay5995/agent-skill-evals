# Core Concepts

Agent Skill Evals helps you trust an agent skill before other people depend on it.

It teaches one testing model:

1. Check the skill setup.
2. Run the agent against a copied sample project.
3. Check the recorded evidence.

That model exists because agent output is not enough. A useful eval should check the skill, the test, the files, the tool calls, the commands, and the final result.

Agent Skill Evals keeps Promptfoo as the host runner. See the [Promptfoo docs](https://www.promptfoo.dev/docs/intro/) for Promptfoo concepts such as configs, providers, prompts, tests, and assertions.

## Skill Checks

Skill Checks run before any agent runs.

They answer: is this skill and its test setup ready for a real run?

They exist because a runtime eval is only useful if the skill and tests are valid first.

They read your `SKILL.md` file and the Promptfoo tests for that skill.

They look for common problems:

- Missing or unclear skill description, so the agent may not use the skill at the right time.
- Missing files referenced by the skill.
- Very large skill files that add too much context.
- Invalid test checks.
- Missing sample projects or check scripts.
- Tests that do not cover unsafe behavior, such as editing files outside the allowed area.

Use `skill.checks` for the normal full check.

Skill Checks do not prove the agent can finish the task. They prove the skill and its tests are ready to run.

`skill.activation` is one Skill Check. It checks whether the skill describes when it should be used. It does not prove that a real agent loaded the skill.

## Sample Projects

Sample projects are small projects that represent the work the skill should handle.

They exist so the agent can do real work without touching your original files.

The `fixture` field points to a sample project or folder. Agent Skill Evals copies that folder before the agent runs. The agent works in the copy, so your original sample stays unchanged.

## Agent Tests With `skill.test`

Use `skill.test` to check the work after an agent runs.

It answers: did the agent do the right work, and avoid the wrong work?

Agent Skill Evals records evidence during the run, then `skill.test` checks that evidence.

The main fields are:

- `preconditions`: checks that must pass before the agent runs.
- `should`: checks that must pass after the agent runs.
- `should_not`: things that must not happen after the agent runs.

`preconditions` are useful when the sample starts broken. If a precondition fails, Agent Skill Evals skips the agent run and reports the failed check.

Prefer clear positive checks. For example, write this:

```yaml
should:
  - code.no_pattern:
      glob: "**/*.ts"
      pattern: "TODO"
```

Not this:

```yaml
should_not:
  - code.no_pattern:
      glob: "**/*.ts"
      pattern: "TODO"
```

## Safe Change Rules

Some checks mean the skill can do risky work, such as editing files or calling tools.

For example, this allows the agent to edit `app.js`, but nothing else:

```yaml
should_not:
  - file.changes_outside_scope:
      scope:
        - app.js
```

When Agent Skill Evals sees checks like this, it expects the skill and tests to be extra clear about what is allowed.

By default, these check names get extra review:

```yaml
agentSkillEvals:
  riskyEffects:
    - file.changes_outside_scope
    - tool.called
  destructiveEffects:
    - file.changes_outside_scope
    - tool.called
```

These settings mean:

- `riskyEffects`: if tests use this check, require a negative test.
- `destructiveEffects`: if tests use this check, require safe instructions and at least one `should_not` check.

Most projects can keep the defaults.

## Evidence

Evidence is the record of what happened during an agent test.

It exists because the agent's final message is not proof.

Evidence turns "the agent said it worked" into "the files, commands, and tool calls show what happened."

It can include:

- The agent's final message.
- Changed files.
- Command results.
- Tool calls recorded by the agent adapter.
- Skills loaded by native adapters or MCP resource reads when Agent Skill Evals can prove them.
- Usage and run details.

`skill.test` reads this evidence when it checks `should` and `should_not`.

Agent Skill Evals can only check what the evidence can show. File checks use the copied sample project. Tool checks use recorded tool calls. They do not prove that nothing happened outside those records.

## Skill Loading

Routing is separate from task completion.

Skill loading checks answer: did the expected skill enter the run, and did unrelated skills stay out?

For routing evals, first prove which skills entered the run, then check whether the task succeeded. Use `skill.loaded` in an agent test when the adapter can record native skill loading or MCP skill resource/tool usage.

See [Skill Loading](/guide/routing-evals) for the full shape.
