# Promptfoo Setup

Agent Skill Evals runs through normal [Promptfoo](https://www.promptfoo.dev/) config files.

::: tip New to Promptfoo?
Promptfoo is the host runner. It reads these config files, runs the providers, and calls the JavaScript assertions. Agent Skill Evals gives Promptfoo the agent provider, skill-check provider, and evidence assertions.
:::

First add the three files from [Getting Started](/guide/getting-started). Then add one config for Skill Checks and one config for agent tests.

## Skill Checks Config

Use this when you want to check a `SKILL.md` file before running an agent:

```yaml
description: Skill checks

prompts:
  - "skill-check"

providers:
  - id: file://./agent-skill-evals/skill-checks.js

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
```

Run it with:

```bash
promptfoo eval -c promptfoo.skill-checks.yaml
```

## Agent Test Config

Use this when you want Agent Skill Evals to copy a sample project, run an agent, and check the result:

```yaml
description: Skill tests

prompts:
  - "{{prompt}}"

providers:
  - id: file://./agent-skill-evals/agent.js
    config:
      adapter: codex-json
      command: codex
      args:
        - exec
        - --json
        - "-"

tests:
  - file://tests/bugfix-workflow.yaml
```

Run it with:

```bash
promptfoo eval -c promptfoo.codex.yaml
```

Supported adapters are:

- `codex-json`
- `claude-code-json`
- `pi-json`

The included examples use real CLI-backed agents. Run the one that matches the
agent CLI you have installed and authenticated:

```bash
pnpm run eval:codex
pnpm run eval:claude
pnpm run eval:pi
```

`pnpm run eval:real` runs the installed real-agent CLIs and skips CLIs that are
not present on the machine.

The examples also include skill-loading evals for routing evidence:

```bash
pnpm --filter @agent-skill-evals/examples mcp:setup
pnpm run eval:routing
```

`eval:routing` runs the Claude HTTP MCP example, the Codex HTTP MCP example,
and the Pi native example. The MCP evals start a local FastMCP HTTP server with
`uv`. They check `skill.loaded` evidence before you add normal task-success
checks.

## If A Run Hangs

Agent Skill Evals runs agent commands and check scripts as child processes.

The agent command uses `config.timeoutMs`. The default is five minutes.

Check scripts use their own `timeoutMs`. The default is one minute.

```yaml
providers:
  - id: file://./agent-skill-evals/agent.js
    config:
      adapter: codex-json
      command: codex
      args:
        - exec
        - --json
        - "-"
      timeoutMs: 60000
```

If a run times out, Promptfoo reports the timeout. Agent Skill Evals also writes run data to the temporary run folder.

Try this order when debugging:

1. Run Skill Checks first.
2. Run the example config for the real agent CLI you are debugging.
3. Re-run `pnpm install` if your Node.js version changed.
4. Lower `timeoutMs` while debugging.
5. Inspect the `runDir` and `evidencePath` shown by Promptfoo.
6. Check timeout values for verifier scripts.
