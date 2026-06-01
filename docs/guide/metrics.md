# Metrics

Metrics are the names you put in Promptfoo assertions.

They answer: which check should this assertion run?

The `metric` value tells Agent Skill Evals which skill-specific check to run.

Most users start with two names:

- `skill.checks`: check a `SKILL.md` file and its tests.
- `skill.test`: check the result after an agent run.

Use `skill.budget` when you also want to limit real-agent token usage:

- `skill.budget`: check real-agent token usage after an agent run.

## `skill.test`

Use this in agent tests.

```yaml
assert:
  - type: javascript
    metric: skill.test
    value: file://./agent-skill-evals/assertions.js
    config:
      metric: skill.test
```

`skill.test` runs the checks listed in `preconditions`, `should`, and `should_not`.

Example:

```yaml
should:
  - verifier.succeeds:
      run: ./verify_login_redirect.sh
```

## `skill.budget`

Use this in real-agent tests when the run records token usage.

```yaml
assert:
  - type: javascript
    metric: skill.budget
    value: file://./agent-skill-evals/assertions.js
    config:
      metric: skill.budget
      agentSkillEvals:
        maxTotalTokens: 300000
        maxCompletionTokens: 15000
```

`skill.budget` fails closed when token usage is missing.

## `skill.checks`

Use this to check a skill file and its tests before an agent runs.

```yaml
assert:
  - type: javascript
    metric: skill.checks
    value: file://./agent-skill-evals/assertions.js
    config:
      metric: skill.checks
```

`skill.checks` runs the full set of skill checks.

## Skill Loading

`skill.activation` checks whether a skill describes when it should be used. It does not prove that the skill was loaded into a real agent run.

Use the runtime check `skill.loaded` inside `skill.test` when the run records which skill was loaded. See [Skill Context Checks](/guide/runtime-checks#skill-context-checks).

## Full Metric List

| Metric | What it checks |
| --- | --- |
| `skill.test` | Checks `preconditions`, `should`, and `should_not` after an agent run. |
| `skill.budget` | Checks real-agent token usage after an agent run. |
| `skill.checks` | Runs all Skill Checks below. |
| `skill.activation` | Checks whether the skill can be chosen at the right time. |
| `skill.budgets` | Checks whether test files declare `skill.budget` when required. |
| `skill.context` | Checks whether referenced files exist and the skill is not too large. |
| `skill.instructions` | Checks whether risky work has safe instructions. |
| `skill.tests` | Checks whether test files are valid and include needed negative tests. |
| `skill.verifiers` | Checks whether sample projects and verifier scripts exist and can run. |

## Default Settings

These settings tell Agent Skill Evals which check names need extra safety review:

```yaml
agentSkillEvals:
  maxSkillLines: 200
  riskyEffects:
    - file.changes_outside_scope
    - tool.called
  destructiveEffects:
    - file.changes_outside_scope
    - tool.called
```

These settings mean:

- `maxSkillLines`: warns when a skill file is too large.
- `riskyEffects`: requires a negative test when these checks are used.
- `destructiveEffects`: requires safe instructions and at least one `should_not` when these checks are used.

Most projects can keep these defaults.

For focused reports, replace `skill.checks` with one of the individual `skill.*` metric names.
