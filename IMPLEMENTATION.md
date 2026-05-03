# SkillKit v0.1 — Implementation Phases

This document is the in-repo execution plan derived from `SPEC.md`. Each
phase ends with a green `npm test` + `npm run typecheck` + a working
end-to-end Promptfoo run, and is committed before the next phase starts.

## Status

| Phase | Description | Status |
| --- | --- | --- |
| 0 | Bootstrap monorepo | Done (commit `8f57481`) |
| 1 | Dynamic skeleton + bugfix-workflow example | In progress |
| 2 | Static suite | Pending |
| 3 | MCP recorder | Pending |
| 4 | AIMock-backed MCP mock provider | Pending |
| 5 | Rubric, generator, `use-skillkit` meta-skill | Pending |

## Locked decisions

- **Language:** TypeScript (`strict`, ESM, NodeNext, target ES2022). Built
  with `tsup`. Typechecking via `tsc -p tsconfig.json --noEmit`.
- **Test runner:** Vitest. Promptfoo runs the per-phase end-to-end evals.
- **Repo shape:** npm workspaces under `packages/*`, plus an `examples/`
  workspace that hosts the working skill, fixtures, and Promptfoo configs.
- **Node:** 20+.
- **Per-phase commit policy:** typecheck + vitest + the phase's E2E
  Promptfoo run must all pass green before commit and push.

## Phase 0 — Bootstrap (done)

Delivered in commit `8f57481`:

- `package.json` workspace root, scripts: `typecheck`, `test`, `build`,
  `eval`, `eval:static`.
- `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`.
- `.github/workflows/ci.yml`.
- `packages/core` stub exporting `@skillkit/core` types
  (`WorldHandle`, `EvidenceHandle`, `*Event`, `Usage`, `SandboxConfig`,
  `EvidenceConfig`, `SkillKitAgentProviderConfig`,
  `SkillKitAssertionResult`, `VerifierPlugin`).
- `examples/package.json` placeholder.
- `README.md` pointing at `SPEC.md`.

## Phase 1 — Dynamic skeleton + working example

**Files (all in place or being added):**

- `packages/verifiers-core/` — 11 effect-type plugins:
  `verifier.succeeds`, `verifier.fails`, `file.exists`, `file.not_modified`,
  `file.contains`, `code.pattern_exists`, `code.no_pattern`,
  `git.push_to_branch`, `git.unrelated_changes`, `secret.read`,
  `network.external_call`. Tests: 23 cases.
- `packages/promptfoo-provider-agent/` — Promptfoo `ApiProvider` with
  `generic` and `claude-code-json` adapters; world isolation via per-run
  fixture copy; pre/post snapshot diff for file-write evidence; pre-agent
  precondition execution. Tests: 3 cases.
- `packages/assertions-core/` — Promptfoo `type: javascript` assertions:
  `preconditions`, `should`, `should_not`, `budget`. Tests: 11 cases.
- `packages/scoring/` — `hard-gates` `assertScoringFunction`. Tests: 7
  cases.
- `examples/skills/bugfix-workflow/SKILL.md`.
- `examples/fixtures/login-bug/` — minimal world with the broken redirect
  + `verify_login_redirect.sh`.
- `examples/agents/stub-fix-redirect.mjs` — deterministic agent script
  used by the E2E eval.
- `examples/tests/bugfix-workflow.yaml` — positive (fix the bug) +
  negative (local-only, don't push) test pair.
- `examples/promptfooconfig.yaml` — wires provider, adapter, assertions,
  scoring.

**Acceptance:**

- `npm run typecheck` clean.
- `npm test` — all vitest cases green.
- `cd examples && npx promptfoo eval -c promptfooconfig.yaml --no-cache` —
  positive + negative tests both green; metadata persists run dir, world
  path, evidence path.

**Commit:** `feat(phase-1): dynamic skeleton + bugfix-workflow example`

## Phase 2 — Static suite

**Files to add:**

- `packages/promptfoo-provider-static/` — provider that reads
  `vars.skillPath` + `vars.testsGlob`, parses SKILL.md frontmatter, walks
  references, returns metadata for static assertions.
- `packages/assertions-static/`:
  - `routing-metadata` (SPEC §7.1)
  - `scenario-validity` (SPEC §7.6)
  - `negative-coverage` (SPEC §7.6)
  - `mcp-evidence` (SPEC §7.5)
  - `context-economy` (SPEC §7.2)
  - `instruction-calibration` (SPEC §7.3)
  - `executable-helper` (SPEC §7.4)
- `examples/promptfoo.static.yaml`.
- `examples/skills/_broken-routing/` — deliberately bad skill to prove
  static checks catch it.

**Acceptance:**

- Vitest: each static assertion has a "good fixture passes" + "bad
  fixture fails with the documented diagnostic" pair.
- E2E:
  `cd examples && npx promptfoo eval -c promptfoo.static.yaml` — Phase 1
  example passes, broken example fails with the expected reason.

**Commit:** `feat(phase-2): static suite`

## Phase 3 — MCP recorder

**Files to add:**

- `packages/mcp-core/` — `McpServerSpec`, `McpConfig`, `McpCallEvent`,
  `McpMockProvider`, `McpMockSession` (SPEC §10.3).
- `packages/mcp-recorder/` — transparent stdio/HTTP proxy that forwards
  MCP traffic and writes normalized `McpCallEvent` JSONL to
  `evidencePath`.
- `packages/verifiers-core/src/mcp-tool-called.ts` and
  `mcp-tool-not-called.ts` — read `evidence.mcpCalls()`, match
  server/tool/args.
- Wire the recorder into `provider-agent` via `config.mcp.recorder = true`.
- New negative-test example (`local-only-no-pr`) using the recorder.

**Acceptance:**

- Vitest: recorder integration test with an in-process fake MCP server;
  matcher tests for server/tool/`args_match`; missing-evidence test fails
  closed.
- E2E: `local-only-no-pr` passes — agent stub records a tool call to
  `github.create_pull_request` only in the positive flow, never in the
  negative flow.

**Commit:** `feat(phase-3): MCP recorder + tool-called assertions`

## Phase 4 — AIMock wrapper

**Files to add:**

- `packages/mcp-aimock/` — `peerDependencies: { aimock: "*" }`,
  implements `McpMockProvider`, wraps AIMock handlers to record evidence
  through `mcp-core`.
- A second example test using `mcp.provider: aimock`.

**Acceptance:**

- Vitest: contract test asserting `mcp-aimock` and `mcp-recorder` produce
  byte-identical evidence JSONL for the same call sequence.
- Vitest: aimock-not-installed fails with a clear "install aimock as peer
  dep" message.
- E2E: same `local-only-no-pr` test from Phase 3, swapped to aimock,
  still passes.

**Commit:** `feat(phase-4): aimock-backed MCP mock provider`

## Phase 5 — Rubric, generator, meta-skill

**Files to add:**

- `packages/rubric-evidence/` — Promptfoo `type: javascript` assertion
  that delegates to `llm-rubric` with inputs `[output.final, world.diff,
  evidence.mcp_calls]`, threshold-gated.
- `packages/generator-default/` — `GeneratorPlugin.generate(...)` bounded
  by `maxCases`, Zod-validated, emits `metadata.draft = true`.
- `packages/skill-use-skillkit/SKILL.md` — the meta-skill (SPEC §14).
- `packages/verifiers-core/src/conversation-*.ts` — the four
  `conversation.*` effects (SPEC §8.5).
- `packages/docs-pack/llms.txt` and `llms-full.txt` (SPEC §13).
- `examples/tests/use-skillkit-meta.yaml` — exact test from SPEC §14.1.
- `examples/fixtures/skillkit-target-create-pr/` — fixture with a
  `create-merge-request` skill the agent is asked to write a SkillKit
  test for.

**Acceptance:**

- Vitest: rubric threshold gating; generator schema/max-cases bounds;
  each `conversation.*` verifier (positive + negative).
- E2E (the meta-eval): `use-skillkit-meta.yaml` passes — agent stub (or
  real `claude` invocation when available) emits
  `tests/create-merge-request/local-only-no-pr.yaml` containing
  `should_not` + `create_pull_request`; rubric `generated_test_quality`
  scores ≥ 0.85.

**Commit:** `feat(phase-5): rubric, generator, use-skillkit meta-skill`

## SPEC gaps addressed inline

These were flagged during planning and are slotted into the relevant
phase rather than tracked separately:

- Phase 1 added `code.pattern_exists` alongside `code.no_pattern` (SPEC
  §17.1 listed only the negative variant though §8.2 uses both).
- Phase 1 defined the missing types (`WorldHandle`, `SandboxConfig`,
  `EvidenceConfig`, `Usage`, `*Event`) in `@skillkit/core`.
- Phase 3 will define `McpServerSpec`, `McpConfig`, `McpCallEvent` in
  `@skillkit/mcp-core`.
- Phase 5 will add `conversation.*` effects (used in SPEC §6.3, §8.5 but
  missing from §17.1's Phase 1 list).
- Phase 5 will re-export Promptfoo's `TestCase` type as
  `PromptfooTestCase` for the generator's return shape.
