# Core Concepts

Agent Skill Evals helps you trust an agent skill before other people depend on it.

It does three things:

- Checks whether a skill file is clear and complete.
- Checks whether the tests for that skill are valid.
- Checks whether an agent using that skill did the right work in a copied sample project.

The basic model is:

1. Start with a known sample project.
2. Give the agent a realistic task.
3. Record what the agent changed, ran, and reported.
4. Check that evidence with assertions.

Routing is a separate concern from task completion. `skill.activation` checks
whether the skill's routing metadata is clear. A behavioral routing eval should
prove which skills entered the agent run before it checks the final task. Use
[Skill Context Checks](/guide/runtime-checks#skill-context-checks) for that
evidence.

## Skill Checks

Skill Checks run before any agent runs.

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

## Sample Projects

The `fixture` field points to a sample project or folder.

Agent Skill Evals copies that folder before the agent runs. The agent works in the copy, so your original sample stays unchanged.

## Agent Tests With `skill.test`

Use `skill.test` to check the work after an agent runs.

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

It is what turns an agent run from "the agent said it worked" into "the files, commands, and tool calls show what happened."

It can include:

- The agent's final message.
- Changed files.
- Command results.
- Tool calls recorded by the agent adapter.
- Skills loaded by native adapters or MCP resource reads when Agent Skill Evals can prove them.
- Usage and run details.

`skill.test` reads this evidence when it checks `should` and `should_not`.

Agent Skill Evals can only check what the evidence can show. File checks use the copied sample project. Tool checks use recorded tool calls. They do not prove that nothing happened outside those records.
