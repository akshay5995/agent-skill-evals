# Package Map

Agent Skill Evals exposes one package: `agent-skill-evals`.

It has three entry points:

- `agent-skill-evals/skill-checks`: checks `SKILL.md` files and their tests.
- `agent-skill-evals/agent`: runs an agent in a copied sample project and saves evidence.
- `agent-skill-evals/assertions`: provides `skill.checks` and `skill.test`.

## Agent Test Flow

1. Promptfoo calls `agent-skill-evals/agent.js`.
2. Agent Skill Evals copies `vars.fixture` to a temporary folder.
3. Agent Skill Evals runs `preconditions` in the copy.
4. If they pass, Agent Skill Evals runs the agent in the copy.
5. Agent Skill Evals records evidence: changed files, command results, tool calls, output, and run details.
6. Promptfoo calls `skill.test`.
7. `skill.test` checks `should` and `should_not` against the evidence.

## Skill Check Flow

1. Promptfoo calls `agent-skill-evals/skill-checks.js`.
2. Agent Skill Evals reads the `SKILL.md` file from `vars.skillPath`.
3. Agent Skill Evals reads the tests from `vars.testsGlob`.
4. Agent Skill Evals checks the skill text, referenced files, tests, sample projects, and verifier scripts.
5. `skill.checks` reports the result.

## Files To Add

Use this for Skill Checks:

```js
// agent-skill-evals/skill-checks.js
export { default } from "agent-skill-evals/skill-checks";
```

Use this for agent tests:

```js
// agent-skill-evals/agent.js
export { default } from "agent-skill-evals/agent";
```

Use this for both `skill.checks` and `skill.test`:

```js
// agent-skill-evals/assertions.js
export { default } from "agent-skill-evals/assertions";
export * from "agent-skill-evals/assertions";
```
