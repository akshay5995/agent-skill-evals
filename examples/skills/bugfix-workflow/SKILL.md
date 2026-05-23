---
name: bugfix-workflow
description: |
  Use when the user reports a concrete bug in an existing application and
  asks for a code fix. Reproduce the bug, write or run a verifier that
  fails, change the smallest amount of code that makes the verifier pass,
  re-run the verifier, and explain the change.

  Do not use for: feature requests, code review, dependency upgrades,
  architecture changes, or "make this faster" requests with no failing
  test.
---

# bugfix-workflow

Promise: a failing repro turns into a passing repro through a minimal,
explained code change.

## Steps

1. Read the bug report. Identify the failing observable behaviour.
2. Locate or write a verifier (test, script, manual repro) that exhibits
   the bug. Run it and confirm it fails.
3. Change the smallest amount of code that plausibly fixes the bug.
4. Re-run the verifier. If it still fails, iterate. If it passes, stop.
5. Explain the change in 2–3 sentences: what was wrong, what you changed,
   why it fixes it.

## Anti-patterns

- Do not modify files unrelated to the bug.
- Do not bypass tests with `--no-verify` or by deleting assertions.
- Do not push to a protected branch (e.g. `main`) without explicit
  instruction.
- Do not read or print secrets (`.env`, `credentials.*`, files under
  `secrets/`).
