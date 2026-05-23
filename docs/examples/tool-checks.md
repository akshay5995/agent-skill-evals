# Tool Checks

Tool Checks look at tool calls that Agent Skill Evals recorded during an agent run.

Use them when a tool call matters. If you only care about the final result, prefer verifier, file, or code checks.

## Expected Tool Call

Use `tool.called` when the agent should call a tool:

```yaml
should:
  - tool.called:
      tool: Edit
      args_match:
        path: app.js
```

## Forbidden Tool Call

Use `tool.not_called` when a tool call must not happen:

```yaml
should:
  - tool.not_called:
      tool: Bash
      args_match:
        command: "rm -rf dist"
```

Keep `tool.not_called` under `should`, not `should_not`. It already means “this must not happen.”

With no filters, `tool.not_called` means no tool calls were recorded:

```yaml
should:
  - tool.not_called
```

## Matching Fields

- `tool`: exact tool name.
- `provider`: optional adapter name, such as `codex-json`, `claude-code-json`, or `pi-json`.
- `server`: optional server name, if the adapter records one.
- `args_match`: the tool arguments you want to match.

`args_match` is a subset match. Include only the fields that matter. Plain values must match exactly, so `command: "rm -rf dist"` does not match `rm -rf build`.

## Limits

- Tool names and provider names must match exactly.
- Omit `provider` unless you need it.
- Objects in `args_match` can include only the fields you care about.
- Arrays in `args_match` must have the same length as the recorded array.
- `args_match` does not support regex or partial text matching.
- Tool Checks do not check tool results.

Tool Checks only see recorded tool calls. They do not prove that nothing happened outside those records.
