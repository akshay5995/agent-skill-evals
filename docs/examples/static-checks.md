# Skill Checks

Skill Checks review a skill and its tests before an agent runs.

Use them first because they are quick and catch common setup problems.

They answer two questions:

1. Is the skill clear enough for the agent to use at the right time?
2. Are the tests strong enough to trust?

That means Agent Skill Evals checks the `SKILL.md` file, the Promptfoo test files, referenced sample projects, and verifier scripts.

It can also catch missing safety coverage. For example, if tests use `file.changes_outside_scope`, Agent Skill Evals expects the skill to explain safe editing and expects the tests to include forbidden behavior.

```yaml
description: Skill checks

prompts:
  - "skill-check"

providers:
  - id: file://./agent-skill-evals/skill-checks.js

defaultTest:
  options:
    runSerially: true

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
          agentSkillEvals:
            maxSkillLines: 200
```

`skillPath` points to the skill folder. `testsGlob` points to the Promptfoo tests for that skill.

Skill Checks do not run the agent. They check the setup first so broken tests do not make a broken skill look good.

Use `skill.checks` for the normal full report. Use a focused metric when you only want one area:

| Metric | What it checks |
| --- | --- |
| `skill.activation` | Whether the skill can be chosen at the right time. |
| `skill.budgets` | Whether real-agent tests declare token budgets when required. |
| `skill.context` | Whether referenced files exist and the skill is not too large. |
| `skill.instructions` | Whether risky work has safe instructions. |
| `skill.tests` | Whether tests are valid and include needed negative tests. |
| `skill.verifiers` | Whether sample projects and verifier scripts exist and can run. |

## Safety Settings

By default, Agent Skill Evals gives these check names extra review:

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
- `destructiveEffects`: if tests use this check, require safe instructions and at least one `should_not`.

A negative test is marked with `kind: negative`, or has `should_not` checks and no `should` checks.

Most users can keep these defaults.

See [Metrics](/guide/metrics) for the full list.
