# Getting Started

## Before you start

Install and authenticate the agent CLI you want to evaluate: [Codex CLI](https://help.openai.com/en/articles/11096431), [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started), or [Pi](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md). Agent Skill Evals invokes that external CLI; the npm dependencies do not include an agent runtime. For non-interactive Claude evals, export `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` or use `ANTHROPIC_API_KEY`; the isolated runtime cannot reuse a macOS Keychain login.

## Install and scaffold

```sh
pnpm add -D agent-skill-evals promptfoo
pnpm exec agent-skill-evals init --skill ./skills/bugfix-workflow --adapter codex
```

Choose `codex`, `claude-code`, or `pi`. The command creates the Promptfoo wiring and `tests/bugfix-workflow.yaml`; it does not create fixtures or fake agents.

The generated Test Pack contains one TODO behavior case. Replace it with the smallest realistic task that proves the skill's product promise.

## Check cheaply

```sh
pnpm exec agent-skill-evals check ./skills/bugfix-workflow
```

This validates the skill and Test Pack without invoking Promptfoo or an agent. Use `--strict` to fail on warnings or `--json` in CI.

By default, `check` looks for `tests/<skill-name>.yaml`. Pass `--tests <path>` when the Test Pack lives elsewhere. A missing token budget is a warning; add one after observing a representative passing run.

## Run the real eval

In `tests/bugfix-workflow.yaml`, replace the TODO prompt and `TODO_EXPECTED_RESULT` with a real request and expected final-output text. Then run:

```sh
pnpm exec promptfoo eval
```

Promptfoo invokes the selected real CLI in an isolated World. Failures print paths to `evidence.json` and the retained World; start debugging there.

```yaml
skill: ../skills/bugfix-workflow
tests:
  - description: explains the verification step
    prompt: Summarize how this skill handles login bugs.
    expect:
      - output.contains: { text: verify }
    budget: { max_total_tokens: 20000 }
```

The exact budget should come from a real passing run; the value above is only an example. Evidence records output, file writes, commands, tool calls, available and loaded skills, usage, turns, runtime identity, and adapter warnings.

For file edits, verifiers, mocks, and multi-turn cases, use the repository's [cross-adapter example](https://github.com/akshay5995/agent-skill-evals/tree/main/examples).
