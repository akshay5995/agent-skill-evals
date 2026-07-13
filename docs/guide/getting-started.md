# Getting Started

## Install and scaffold

```sh
pnpm add -D agent-skill-evals promptfoo
pnpm exec agent-skill-evals init --skill ./skills/bugfix-workflow --adapter codex
```

Choose `codex`, `claude-code`, or `pi`. The command creates the Promptfoo wiring and `tests/bugfix-workflow.yaml`; it does not create fixtures or fake agents.

## Check cheaply

```sh
pnpm exec agent-skill-evals check ./skills/bugfix-workflow
```

This validates the skill and Test Pack without invoking Promptfoo or an agent. Use `--strict` to fail on warnings or `--json` in CI.

## Run the real eval

In `tests/bugfix-workflow.yaml`, replace the TODO prompt and `TODO_EXPECTED_RESULT` with a real request and expected final-output text. Then run:

```sh
pnpm exec promptfoo eval
```

Promptfoo invokes the selected real CLI in an isolated World. Failures print paths to `evidence.json` and the retained World; start debugging there.

```yaml
skill: ../skills/bugfix-workflow
tests:
  - prompt: Summarize how this skill handles login bugs.
    expect:
      - output.contains: { text: verify }
```

For file edits, verifiers, mocks, and multi-turn cases, use the repository's [cross-adapter example](https://github.com/akshay5995/agent-skill-evals/tree/main/examples).
