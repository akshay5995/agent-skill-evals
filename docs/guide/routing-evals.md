# Skill Loading

Skill Loading checks prove which skill entered an agent run.

They exist because task success alone does not prove the agent used the expected skill. A routing eval should prove the skill context first, then check the task result.

The simple model is:

1. A skill is made available to an agent.
2. The agent runs.
3. Agent Skill Evals checks the evidence.

There are two practical ways to make a skill available:

- `native`: the agent runtime has its own skill mechanism.
- `mcp`: the skill is served through MCP.

The examples cover three adapter paths:

- Claude Code over HTTP MCP.
- Codex over HTTP MCP.
- Pi native skills with `--no-skills --skill`.

In MCP itself, skills are not a separate protocol primitive. FastMCP exposes skills as `skill://...` resources with `SkillProvider` or `SkillsDirectoryProvider`. For clients that only expose tools to the model, serve a small skill-loader tool with a clear description. The example server also keeps the underlying resources available through `ResourcesAsTools`.

Agent Skill Evals should not guess what the model was thinking. It should check what the run can prove.

## What To Prove

Before checking task success, prove the context:

- The expected skill was loaded into the run.
- Nearby or unrelated skills were not loaded into the run.

This is smaller than a generic routing eval. It avoids asking Agent Skill Evals to inspect a private model choice.

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

That is the normal user-facing shape. Adapter-specific tool names stay in evidence for debugging, but users should not need to write them in routing evals.

These example configs focus on routing evidence. In a full skill test, keep the
same `skill.loaded` check and add the normal task checks after it: verifier
commands, file checks, tool checks, or whatever proves the work was done.

## MCP Evidence

The example MCP server uses Python FastMCP over Streamable HTTP. Agent Skill Evals starts it with `uv`, serves both example skills as MCP tools, keeps the `skill://...` resources available, and passes the HTTP `/mcp/` URL to the agent adapter.

```bash
pnpm --filter @agent-skill-evals/examples mcp:setup
pnpm run eval:mcp
```

Agent Skill Evals maps MCP skill-loader tool calls and MCP resource reads into the same `skillsLoaded` evidence. If an adapter records a `load_brand_deck_skill` tool call or a resource read for `skill://brand-deck/SKILL.md`, Agent Skill Evals records `brand-deck` as loaded.

The raw tool call still appears in `toolCalls`, so failures are inspectable in `evidence.json`, but the assertion remains `skill.loaded`.

The default MCP mapping is:

```yaml
providers:
  - id: file://./agent-skill-evals/agent.js
    config:
      skillEvidence:
        mcpTool:
          toolPatterns:
            - ^load_(?<skill>[A-Za-z0-9_-]+)_skill$
        mcpResource:
          uriArgPaths:
            - uri
          uriPatterns:
            - ^skill://(?<skill>[^/]+)/SKILL\.md$
```

Change those fields if a harness records skill loading with a different tool name, argument path, or URI shape. Tool captures convert underscores to hyphens, so `load_brand_deck_skill` becomes `brand-deck`.

The Codex noninteractive example includes a small prompt hint to use the matching MCP skill tool. In local testing, Claude Code chose the MCP skill tool from route metadata alone, while Codex needed that hint to produce observable MCP evidence.

## Native Evidence

Native skill loading should use the same evidence shape:

```json
{"skill":"brand-deck","delivery":"native","provider":"pi-json","source":"--skill","startedAt":1760000000000}
```

Only record native skill evidence when the adapter can observe or deterministically construct it from the actual invocation. Do not treat `vars.skill` as proof. `vars.skill` is expected state for the test.

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

Codex and Claude Code should use the MCP path for deterministic routing evals
unless their native CLIs expose an equivalent "load exactly these skills and no
others" invocation.

Native argument mapping is also configurable. `whenArgs` requires every listed
argument to be present. `whenAnyArgs` requires at least one listed argument to
be present. `skillPathFlags` names the flags whose next value is a skill path.

```yaml
providers:
  - id: file://./agent-skill-evals/agent.js
    config:
      skillEvidence:
        nativeArgs:
          whenArgs:
            - --only-skills
          whenAnyArgs:
            - --no-discovery
          skillPathFlags:
            - --load-skill
          provider: custom-json
```

## The Loop

```text
Was the right skill loaded?
Were the wrong skills excluded?
Did the final task pass?
```

That is the Agent Skill Evals routing story for now: not mind-reading, just evidence.
