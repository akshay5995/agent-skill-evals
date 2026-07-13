---
name: agent-eval-skills
description: Evaluate an existing agent skill with Promptfoo-native behavior, routing, or role-play tests. Use when a skill needs executable evidence that its product promise works. Do not use to author the domain skill itself.
---

# Agent Skill Evals

Build a tight red → evidence → green loop. Promptfoo is the runtime; `agent-skill-evals` supplies its provider, assertions, Test Pack, and static checks. Batch related reads and spend agent turns only on evidence that can change the eval.

## 1. Contract

Read the target `SKILL.md`, every file it points to, and existing project tests. State the smallest observable product promise and choose one branch: behavior, routing, or role-play.

Complete when the promise names an observable outcome and the selected branch matches it.

## 2. Scaffold

Detect the repository's package manager and install `agent-skill-evals` and `promptfoo` as development dependencies when absent. Run installed binaries through that package manager:

```sh
pnpm exec agent-skill-evals init --skill <path> --adapter <codex|claude-code|pi>
```

Adapt the command to the detected manager, such as `npx agent-skill-evals` for npm. Treat CLI help and generated files as the interface; source and built bundles are outside the setup path.

Complete when the generated config imports the package's public entry points and `promptfoo eval` remains the runtime command.

## 3. Red

Add the smallest realistic fixture. When final output cannot prove the promise, add a deterministic verifier that fails before the agent runs. Verify stable structure and facts, not incidental prose: normalize formatting, accept grammatical variation, and reject missing, misplaced, or invented facts. Exact bytes are the contract only when the target skill promises exact bytes.

When the promise is unrestricted semantic equivalence and the result is present in final output, use a native Promptfoo model-graded assertion under `promptfoo.assert` rather than growing a synonym list.

Complete when the verifier fails on the missing behavior and passes representative valid variations without accepting an invalid result.

## 4. Evidence

Replace the starter TODO with one realistic case under `tests/` and one `expect` list:

```yaml
skill: ../skills/target-skill
tests:
  - prompt: Perform the realistic task.
    fixture: ../fixtures/target-skill
    preconditions:
      - verifier.fails: { run: ./verify.sh }
    expect:
      - verifier.succeeds: { run: ./verify.sh }
      - file.changes_within: { paths: [expected-output.md] }
      - tool.not_called: { tool: destructive_action }
```

For behavior, explicitly invoke the target skill. For routing, add distractors and prove both `skill.loaded` and `skill.not_loaded`; availability alone is insufficient. For role-play, use `conversation.scripted_user` for deterministic dialogue or `conversation.simulated_user` when variation is the subject, and set `max_turns`.

Use real observed evidence. Local HTTP, command, or MCP mocks may stand in for external systems while preserving the real boundary.

Complete when every assertion traces to the product promise and the case has no unrelated requirements.

## 5. Green

Run the static check before the paid eval, then run Promptfoo through the detected package manager:

```sh
pnpm exec agent-skill-evals check <skill> --tests <test-pack>
pnpm exec promptfoo eval
```

On failure, inspect `evidence.json`, the retained World, and verifier output before changing the test. Strengthen the product or its evidence boundary; preserve the target skill's intended behavior.

Complete when static checks pass, the generated runtime eval passes with an authenticated supported CLI, and the run stays within its existing token budget. Treat a budget failure as an efficiency regression to minimize; preserve the ceiling while removing unnecessary turns and context. If no authenticated CLI is available, report runtime validation as pending rather than complete.

## Product boundary

Keep the public surface Promptfoo-native: package entry points, realistic examples, evidence assertions, and optional real-boundary mocks. Extend those seams when the eval needs more capability.
