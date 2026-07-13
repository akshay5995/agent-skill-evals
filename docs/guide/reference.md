# Reference

## Commands

`agent-skill-evals init --skill <path> --adapter <codex|claude-code|pi>` creates the minimal Promptfoo workspace. `agent-skill-evals check <skill> [--tests <pack>] [--strict] [--json]` performs cheap static validation. `promptfoo eval` owns runtime execution, filtering, repetition, caching, output, and the web UI.

## Test Pack

```yaml
skill: ../skills/support-agent
tests:
  - description: answers a support request
    prompt: Help this customer.
    expect:
      - output.contains: { text: resolved }
```

Paths are relative to the Test Pack. Each case has one positive `expect` list; negative guarantees use explicit checks such as `tool.not_called`, `skill.not_loaded`, and `file.unchanged`.

Top-level skill fields are `skill`, `supporting_skills`, `distractor_skills`, and `builtin_distractor`. A case may set `mode`, `fixture`, `setup`, `preconditions`, `conversation`, `environment`, `promptfoo.assert`, and `budget`; the sections below describe their runtime behavior.

Use `promptfoo.assert` for native Promptfoo assertions such as `llm-rubric` when the result is present in final output and deterministic evidence cannot prove semantic quality. These assertions pass through to Promptfoo and may require a grading provider; keep file and tool guarantees in `expect`.

## Worlds and skills

Every case receives a fresh World with only its declared skills. Behavior cases explicitly invoke the target skill. Routing cases expose the target plus distractors and require observed load evidence; availability never proves use.

Agent CLIs receive an isolated home. For real Claude evals, export `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` or use `ANTHROPIC_API_KEY`.

## Role play

`conversation.scripted_user` supplies deterministic replies. `conversation.simulated_user` supplies a goal and optional persona; `max_turns` bounds cost. The World and evidence persist across turns. The simulated user cannot access the World or mocks unless `allow_mocks: true` is declared.

## Mock Services

Mocks are opt-in and case-local. They run at real boundaries and are stopped after the case.

```yaml
environment:
  mocks:
    - kind: http
      name: billing
      command: node
      args: [../mocks/billing.mjs]
      ready: { path: /health, timeout_ms: 5000 }
      expose_as: BILLING_URL
    - kind: command
      name: deploy
      executable: ../mocks/deploy
    - kind: mcp
      name: crm
      transport: stdio
      command: node
      args: [../mocks/crm.mjs]
      provides_skill_evidence: true
```

HTTP mocks receive an allocated localhost `PORT`; their URL is injected through `expose_as`, and their bounded output and lifecycle details are retained in `mock-services.json`. Command mocks are copied into an isolated `PATH`. MCP configuration is translated for Codex and Claude Code; Pi fails explicitly because its core CLI has no equivalent built-in MCP configuration flag. Set `provides_skill_evidence: true` only when the MCP service emits observable target-skill load telemetry for routing tests.

## Runtime checks

Verifier: `verifier.succeeds`, `verifier.fails`.

Files: `file.exists`, `file.created`, `file.contains`, `file.unchanged`, `file.changes_within`.

Tools and turns: `tool.called`, `tool.not_called`, `tool.count`, `tool.sequence`, `turn.count`.

Routing and output: `skill.loaded`, `skill.not_loaded`, `output.contains`, `output.matches`.

Verifier commands run inside the World. File scope entries are exact files or directories ending in `/`. Tool checks inspect normalized observed calls. Output regexes use JavaScript syntax. Runtime assertions fail closed when adapter evidence contains parsing warnings.

## Evidence and budgets

Evidence records output, files, commands, tool calls, available and loaded skills, turns, token usage, runtime identity, and warnings. Declaring `budget` adds `skill.budget`; missing usage fails closed.
