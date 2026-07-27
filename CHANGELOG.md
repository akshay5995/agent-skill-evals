# Changelog

## 0.2.0

### Added

- **Native routing evidence.** A tool call that reads an installed skill's `SKILL.md` (from `.agents/skills/` or `.claude/skills/`) now records a `delivery: native` skill-load event. Routing tests work out of the box on all three adapters — no MCP telemetry mock required. MCP evidence remains the strongest signal and can still be required with `skill.loaded: { skills: [...], delivery: mcp }`.
- **Baseline mode.** `mode: baseline` runs a case with no skills installed, so a Test Pack can prove the skill is what makes the difference — assert the unaided outcome (for example `verifier.fails`) or compare turns and tokens against the behavior case.
- `agent-skill-evals --version`, and `help`/`--help`/`-h` now exit 0.
- `check` output ends with an error/warning count summary.

### Changed

- `init` prints a note when the target skill directory does not exist yet, instead of leaving the first `check` run to fail with a raw ENOENT.
- `check` reports missing SKILL.md and missing Test Packs with actionable messages and fix suggestions instead of raw ENOENT errors.
- The `routing.observation.unsupported` static check error was removed; routing assertions no longer require an MCP mock with `provides_skill_evidence: true`.
- Baseline cases asserting `skill.loaded`/`skill.not_loaded` fail static checks with `baseline.skill_checks.invalid`.

### Docs

- New customer-facing post: *How to Evaluate Agent Skills* (`docs/blog/evaluating-agent-skills.md`), with external research on trigger reliability, untested-skill prevalence, and token-cost impact.
- Documented the routing-evidence hierarchy, baseline mode, `promptfoo eval --repeat` trial guidance, and the security boundary (evals prove a skill works, not that it is safe).

## 0.1.2

- ESM scaffold fixes for the Promptfoo bridges; CI audit client upgrade.

## 0.1.1

- Documentation refresh and skills.sh positioning.

## 0.1.0

- Initial release: Promptfoo-native skill evals with `init`/`check` CLI, isolated Worlds, runtime checks, mocks, conversations, and budgets.
