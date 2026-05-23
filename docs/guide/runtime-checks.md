# Runtime Checks

Runtime Checks are the checklist items inside `preconditions`, `should`, and `should_not`.

They check the copied sample project and the run datan Agent Skill Evals saved.

You can write a check in any of these forms:

```yaml
should:
  - file.exists
  - type: file.exists
    path: app.js
  - file.exists:
      path: app.js
```

Most examples use the last form for readability.

## Verifier Checks

Use verifier checks when you already have a script that proves the behavior.

### `verifier.succeeds`

Passes when a command exits with code `0`.

```yaml
should:
  - verifier.succeeds:
      run: ./verify_login_redirect.sh
      args:
        - --quiet
      timeoutMs: 60000
```

### `verifier.fails`

Passes when a command exits with a non-zero code.

```yaml
preconditions:
  - verifier.fails:
      run: ./verify_login_redirect.sh
```

`run` paths are relative to the copied sample project. `args` is optional. `timeoutMs` defaults to `60000`.

## File Checks

Use file checks when the result should be visible in files.

### `file.exists`

Passes when a file exists.

```yaml
should:
  - file.exists:
      path: app.js
```

### `file.created`

Passes when the agent created a file during the run.

```yaml
should:
  - file.created:
      path: report.md
```

### `file.contains`

Passes when a file contains exact text. This is not regex matching.

```yaml
should:
  - file.contains:
      path: app.js
      text: /dashboard
```

### `file.not_modified`

Passes when a file did not change.

Use it under `should`, not `should_not`.

```yaml
should:
  - file.not_modified:
      path: package.json
```

### `file.changes_outside_scope`

Passes when a changed file is outside the allowed paths.

This check usually belongs under `should_not`.

```yaml
should_not:
  - file.changes_outside_scope:
      scope:
        - app.js
```

`scope` entries are path prefixes. `src/` allows changes under `src/`. `app.js` allows changes to `app.js`.

## Code Checks

Use code checks when you need regex matching across files.

### `code.pattern_exists`

Passes when a regex appears in matching files.

```yaml
should:
  - code.pattern_exists:
      glob: "**/*.js"
      pattern: "res.redirect"
```

### `code.no_pattern`

Passes when a regex does not appear in matching files.

Use it under `should`, not `should_not`.

```yaml
should:
  - code.no_pattern:
      glob: "**/*.ts"
      pattern: "TODO"
```

## Tool Checks

Use tool checks when you need to check recorded tool calls.

### `tool.called`

Passes when Agent Skill Evals finds a matching tool call in the run data.

```yaml
should:
  - tool.called:
      tool: Edit
      provider: codex-json
      args_match:
        path: app.js
```

`tool` is required. `provider`, `server`, and `args_match` are optional filters.

### `tool.not_called`

Passes when Agent Skill Evals does not find a matching tool call.

Use it under `should`, not `should_not`.

```yaml
should:
  - tool.not_called:
      tool: Write
      args_match:
        path: package.json
```

With no filters, `tool.not_called` passes only when no tool calls were recorded.

Tool checks only read recorded tool calls. They do not prove that nothing happened outside those records.

`args_match` is an exact subset match. Objects may include only the fields you care about. Arrays must have the same length. Plain values must match exactly.

See [Tool Checks](/examples/tool-checks) for more examples.

## Skill Context Checks

Use skill context checks when Agent Skill Evals can prove which skills entered the agent run.
For routing tests, keep the check in `should` and use both `should_include`
and `should_exclude` so the assertion reads as one expected skill context.

### `skill.loaded`

Passes when the loaded skill evidence includes the expected skills and excludes the forbidden skills.

```yaml
should:
  - skill.loaded:
      should_include:
        - brand-deck
      should_exclude:
        - bugfix-workflow
```

`delivery` can be `native` or `mcp`. `provider`, `server`, and `source` are optional filters.
`should_not` works like other positive runtime checks, but `should_exclude`
is usually clearer when you want to prove a nearby skill was not loaded.

For MCP delivery, Agent Skill Evals maps skill-loader tools and `skill://.../SKILL.md` resource reads from supported adapters into the same loaded-skill evidence. Raw tool calls remain in `evidence.json` for debugging.

If your harness records skill loading differently, configure the mapping on the Agent Skill Evals provider:

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
            - resource.uri
          uriPatterns:
            - ^skill://(?<skill>[^/]+)/content$
```
