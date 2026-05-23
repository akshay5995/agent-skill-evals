# Agent Skill Evals Agent Guide

## Why This Repo Exists

Agent Skill Evals helps people test reusable agent skills with Promptfoo. The product
should stay Promptfoo-native: users keep running `promptfoo eval`, and Agent Skill Evals
provides the package, providers, assertions, examples, and evidence model needed
to make those evals useful.

## Repo Map

- `packages/promptfoo/`: the `agent-skill-evals` package. Its public entry
  points are `./agent`, `./skill-checks`, and `./assertions`.
- `examples/`: the public runnable workspace for real skills, real Promptfoo
  configs, sample projects, fixtures, and adapter evals.
- `docs/`: VitePress documentation. Keep it user-facing and grounded in current
  implementation.
- `scripts/package-smoke.mjs`: release-like package smoke test for the packed
  consumer flow.

## Before Changing Code

- Use the Node version in `.nvmrc` and plain `pnpm`.
- Read the nearest implementation and docs before changing public behavior.
- Update the relevant docs in the same change whenever behavior, public APIs,
  examples, commands, or user-facing workflows change.
- Preserve the package boundary: do not add a root export or compatibility shim
  unless the user explicitly asks for a new public contract.
- Keep examples concrete and runnable. Do not add fake agent stubs to
  `examples/`; package smoke fixtures should be generated inside the smoke
  harness when needed.

## Product Rules

- Promptfoo is the host. Do not introduce a separate Agent Skill Evals runner for normal
  user flows.
- Static checks belong in core.
- Evidence is a first-class public concept. Runtime assertions should check what
  Agent Skill Evals can observe: files, command results, tool calls, loaded skills, usage,
  final output, and run details.
- Do not infer private model intent. For routing, prove that the expected skill
  was loaded and unrelated skills were not loaded before checking task success.

## Verification

Use the smallest command that covers the change:

- `pnpm run typecheck`
- `pnpm test`
- `pnpm run build`
- `pnpm run docs:build`
- `pnpm run eval:static`
- `pnpm run release:package-smoke`
- `pnpm run eval:real` for manual real-adapter verification across available
  Codex, Claude, and Pi CLIs.

For eval failures, inspect `evidence.json` and Promptfoo logs before claiming the
agent failed. Promptfoo summaries are often less useful than the recorded
evidence.

## Useful Pointers

- Public overview: `README.md`
- Package contract: `docs/guide/package-map.md`
- First setup path: `docs/guide/getting-started.md`
- Runtime/evidence model: `docs/guide/core-concepts.md` and
  `docs/guide/runtime-checks.md`
- Routing evidence: `docs/guide/routing-evals.md`
