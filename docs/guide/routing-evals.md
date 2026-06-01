# Skill Loading

Skill Loading checks prove which skill entered an agent run.

They exist because task success alone does not prove the agent used the expected skill. Prove the skill first, then check the task result.

The simple model is:

1. A skill is made available to an agent.
2. The agent runs.
3. Agent Skill Evals checks the evidence.

There are two practical ways to make a skill available:

- `native`: the agent has its own skill mechanism.
- `mcp`: the skill is served through MCP.

The examples cover three paths:

- Claude Code over HTTP MCP.
- Codex over HTTP MCP.
- Pi native skills with `--no-skills --skill`.

Agent Skill Evals should not guess what the model was thinking. It should check what the run can prove.

## What To Prove

Before checking task success, prove the context:

- The expected skill was loaded into the run.
- Nearby or unrelated skills were not loaded into the run.

This keeps the test grounded in observable evidence instead of guesswork.

## Test Shape

Use `skill.loaded` inside `should`.

```yaml
should:
  - skill.loaded:
      should_include:
        - brand-deck
      should_exclude:
        - bugfix-workflow
```

That is the normal test shape. Tool and server details stay in `evidence.json` for debugging, but the test can stay focused on the skill name.

In a full skill test, keep the same `skill.loaded` check and add the normal task
checks after it: verifier commands, file checks, tool checks, or whatever proves
the work was done.

## MCP Skill Loading

The MCP examples start a local server, make the example skills available, run
the agent, and check `skill.loaded`.

```bash
pnpm --filter @agent-skill-evals/examples mcp:setup
pnpm run eval:mcp
```

Agent Skill Evals can turn MCP skill-loader tool calls and MCP resource reads
into loaded-skill evidence. For example, if the run records
`load_brand_deck_skill`, Agent Skill Evals records `brand-deck` as loaded.

The raw tool call still appears in `toolCalls`, so failures are inspectable in `evidence.json`, but the assertion remains `skill.loaded`.

Most users do not need custom mapping. If your setup records skill loading with
different tool names or resource URLs, use the `skillEvidence` config
shown in [Runtime Checks](/guide/runtime-checks#skill-context-checks).

## Native Skill Loading

Native skill loading should produce the same kind of evidence:

```json
{"skill":"brand-deck","delivery":"native","provider":"pi-json","source":"--skill","startedAt":1760000000000}
```

Only record native skill evidence when the run can prove it. Do not treat the
test's expected skill name as proof that the skill loaded.

Pi has a deterministic native shape:

```yaml
args:
  - --mode
  - json
  - --no-skills
  - --skill
  - ./skills/brand-deck
```

When `--no-skills` is present, Agent Skill Evals can record each `--skill` path as
`skill.loaded` evidence because unrelated native skills were disabled by the
same invocation. Run the example with:

```bash
pnpm run eval:native:pi
```

Run every routing example with:

```bash
pnpm run eval:routing
```

Use MCP for Codex and Claude Code routing tests unless their native CLIs expose
a way to load exactly the skills under test.

Native argument mapping is also configurable for custom agents through
`skillEvidence`.

## The Loop

```text
Was the right skill loaded?
Were the wrong skills excluded?
Did the final task pass?
```

That is the skill-loading test: prove the skill, exclude the wrong skills, then
check the task.
