# Reference

## Commands

- `agent-skill-evals init --skill <path> --adapter <codex|claude-code|pi> [--dir <path>] [--force]` creates the minimal Promptfoo workspace. Existing files are skipped unless `--force` is set.
- `agent-skill-evals check <skill> [--tests <pack>] [--strict] [--json]` validates the skill and Test Pack without running an agent. It defaults to `tests/<skill-name>.yaml`; `--strict` turns warnings into failures.
- `promptfoo eval` owns runtime execution, filtering, repetition, caching, output, and the web UI.

## Test Pack

```yaml
skill: ../skills/support-agent
tests:
  - description: answers a support request
    prompt: Help this customer.
    expect:
      - output.contains: { text: resolved }
```

Paths are relative to the Test Pack. Every case requires one non-empty `expect` list. Negative guarantees use explicit checks such as `tool.not_called`, `skill.not_loaded`, and `file.unchanged`.

The required top-level fields are `skill` and `tests`. Optional shared fields are `supporting_skills`, `distractor_skills`, `builtin_distractor`, `skill_delivery`, and `environment`.

Each case requires `prompt` and `expect`. Optional fields are `description`, `mode`, `skill_delivery`, `fixture`, `setup`, `supporting_skills`, `distractor_skills`, `preconditions`, `conversation`, `environment`, `budget`, `promptfoo.assert`, and `metadata`. Case-level `supporting_skills` replace the shared list when present; case-level distractors and mocks are added to their shared lists. `setup` contains shell commands that run inside the World before preconditions; a non-zero exit stops the case.

Use `promptfoo.assert` for native Promptfoo assertions such as `llm-rubric` when the result is present in final output and deterministic evidence cannot prove semantic quality. These assertions pass through to Promptfoo and may require a grading provider; keep file and tool guarantees in `expect`.

## Worlds and skills

Every case receives a fresh World and an isolated skill set. Behavior cases explicitly invoke the target skill and include any supporting skills. Routing cases expose the target and declared distractors; when `builtin_distractor` is omitted, it defaults to `true` and adds a generated neutral distractor. Set it to `false` to use only explicit distractors. Routing still requires observed load evidence; availability never proves use.

### Skill delivery

`skill_delivery` chooses how the case's skills reach the agent. The default, `native`, installs each declared skill into the World (`.agents/skills` for Codex, `.claude/skills` for Claude Code, `--skill` flags for Pi). Setting `skill_delivery: mcp` — at the pack level or per case — replaces the native install entirely: skills are served only through a built-in MCP skill server named `skills`, so every skill load crosses an observable boundary. This is the supported way to satisfy the routing evidence requirement without writing your own MCP mock.

The built-in server exposes, per declared skill, a tool named exactly after the skill (e.g. `bugfix-workflow`) whose description is the skill's frontmatter `description` (so routing choice stays informed), returning the SKILL.md body plus a listing of supporting files; a `read_skill_file` tool for supporting files; and `skill://<name>/<path>` resources for every skill file. Calls to a skill's tool and `skill://<name>/SKILL.md` resource reads are recorded as `skill.loaded` evidence with `delivery: mcp` and `server: skills` — no `skillEvidence` configuration is needed.

Claude Code exposes MCP tools to the model as `mcp__skills__<name>`, and the Claude API rejects tool names over 64 characters; with the server name fixed at `skills`, that leaves 51 characters for the skill name itself. `check` fails with `skill.name.mcp_length` if a declared skill's directory name is longer, and with `skill.name.reserved` if a skill is literally named `read_skill_file`.

MCP delivery works with the `codex` and `claude-code` adapters; Pi fails with an explicit error because its core CLI has no built-in MCP configuration flag. The Mock Service name `skills` is reserved while MCP delivery is active. In behavior mode the prompt is prefixed with an explicit instruction to call the load tool (the MCP analogue of native explicit invocation), and the observed load is recorded with `delivery: mcp`. Note that MCP load evidence normalizes underscores in skill names to hyphens; `check` warns when a declared skill name contains `_`.

Agent CLIs receive an isolated home, but the selected CLI must already be installed and authenticated. Follow the official setup for [Codex CLI](https://help.openai.com/en/articles/11096431), [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started), or [Pi](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md). For non-interactive Claude evals, export `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` or use `ANTHROPIC_API_KEY`.

## Role play

`conversation.scripted_user` supplies deterministic replies. `conversation.simulated_user` supplies a goal and optional persona; `max_turns` bounds the conversation from 1 to 20 turns. The World and evidence persist across turns. The simulated user cannot access the World or mocks unless `allow_mocks: true` is declared.

## Mock Services

Mocks are opt-in and case-local. They run at real protocol boundaries. Locally started HTTP processes are stopped after the case; command mocks are isolated through `PATH`, while MCP entries configure the selected agent CLI.

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

HTTP mocks receive an allocated localhost `PORT`; their URL is injected through `expose_as`, and their bounded output and lifecycle details are retained in `mock-services.json`. Command mocks are copied into an isolated `PATH`. MCP configuration is translated for Codex and Claude Code; Pi fails explicitly because its core CLI has no equivalent built-in MCP configuration flag. MCP entries may start a stdio command or reference an existing HTTP URL. Set `provides_skill_evidence: true` only when the MCP service emits observable target-skill load telemetry for routing tests; `skill_delivery: mcp` provides this out of the box through the built-in skill server, and reserves the mock name `skills`.

## Runtime checks

Verifier: `verifier.succeeds`, `verifier.fails`.

Files: `file.exists`, `file.created`, `file.contains`, `file.unchanged`, `file.changes_within`.

Tools and turns: `tool.called`, `tool.not_called`, `tool.count`, `tool.sequence`, `turn.count`.

Routing and output: `skill.loaded`, `skill.not_loaded`, `output.contains`, `output.matches`.

Verifier commands run inside the World. File scope entries are exact files or directories ending in `/`. Tool checks inspect normalized observed calls. `skill.loaded` and `skill.not_loaded` accept optional filters — `delivery` (`native` or `mcp`), `provider`, `server`, and `source` — for example `skill.loaded: { skills: [demo], delivery: mcp }`. Output regexes use JavaScript syntax. Runtime assertions fail closed when adapter evidence contains parsing warnings.

## Evidence and budgets

Evidence records final output, file writes, commands, tool calls, available and loaded skills, turns, token usage, run details, runtime identity, and warnings. Runtime checks grade the supported observable outcomes listed above; command results and run metadata remain debugging evidence rather than general-purpose assertions.

Declaring `budget` adds `skill.budget`. Supported limits are `max_total_tokens`, `max_prompt_tokens`, `max_completion_tokens`, and `max_cached_tokens`; missing usage for a configured limit fails closed.
