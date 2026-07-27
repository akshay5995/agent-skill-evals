# How to Evaluate Agent Skills (and Why "It Worked When I Tried It" Isn't Enough)

Agent skills are becoming the unit of reuse for AI agents. A skill is a playbook — a `SKILL.md` plus supporting files — that tells an agent how to perform a task: fix a bug following your team's workflow, draft release notes, triage a support ticket. Skills get shared, versioned, and installed like packages.

But while we ship skills like code, most of us still test them like folklore: run it once, watch the agent do something plausible, ship it.

This post explains why that breaks down, what a trustworthy skill evaluation actually needs, and how Agent Skill Evals delivers it on top of [Promptfoo](https://www.promptfoo.dev/).

## The problems with how skills are tested today

### 1. The demo test

The most common skill "test" is a single manual run on the author's machine. It proves the skill worked once, with one model version, one prompt phrasing, and one repository state. Models update, agent CLIs change flags, and prompts drift — and nothing tells you the skill quietly stopped working. A skill without a repeatable eval is a screenshot, not a product.

This isn't a strawman: [SkillsBench counted over 47,000 published skills across 6,300+ repositories](https://medium.com/google-cloud/agent-skills-evals-stop-vibe-testing-your-skills-edd9eaaa6a1a), most of them AI-generated, and almost none of them tested. As Philipp Schmid (Google DeepMind) [puts it](https://x.com/_philschmid/status/2029570052530360719): "Agent skills are powerful but they are often AI-generated and not tested."

### 2. Trusting the agent's self-report

Agents narrate confidently. "I've fixed the login redirect and verified the tests pass" is an output, not an outcome — the agent may have edited the wrong file, skipped the verification, or hallucinated the result entirely. If your eval greps the agent's final message for the word "fixed", you are testing the agent's optimism, not your skill.

### 3. Testing in your own workspace

Running a skill in your live checkout contaminates everything: leftover files from the last run, your global agent config, your logged-in shell. Results aren't reproducible, failures aren't inspectable, and a misbehaving agent can damage real work. Every test run needs a fresh, disposable environment — and when a run fails, you need to be able to open that environment and see exactly what the agent did.

### 4. Routing is invisible

A perfect skill still fails if the agent never loads it. Skills activate based on their `description` — vague activation text means the agent skips your skill, or worse, loads a different one. Community measurements put autonomous skill activation at [roughly 50% even for valid skills](https://medium.com/@ivan.seleznov1/why-claude-code-skills-dont-activate-and-how-to-fix-it-86f679409af1), and "skills not triggering" has spawned a [whole](https://dev.to/lizechengnet/why-claude-code-skills-dont-trigger-and-how-to-fix-them-in-2026-o7h) [genre](https://blog.fsck.com/2025/12/17/claude-code-skills-not-triggering/) of troubleshooting posts. Almost nobody tests this, because "did the agent load the right skill?" is hard to observe. Availability is not use: seeing the skill in the agent's catalog proves nothing about whether it was applied.

### 5. Every test costs real money and minutes

An agent eval invokes a real model on a real task. If the only way to catch a broken file reference, a vague description, or a typo'd assertion is a full eval run, you'll pay tokens to discover mistakes a linter could have caught in milliseconds.

### 6. Cost regressions ship silently

A skill edit that still passes every check but makes the agent take three times the turns — and three times the tokens — is a regression. Without a budget in the eval, you'll only discover it on the invoice. The stakes run in both directions: [research cited by Tessl](https://tessl.io/blog/anthropic-brings-evals-to-skill-creator-heres-why-thats-a-big-deal/) found high-quality skills yield 54–81% token savings, while poorly designed ones *increase* cost.

## What a good skill eval needs

Working backwards from those failures, a trustworthy skill evaluation has five properties:

1. **It runs the real agent.** Not a mock model, not a simulation — the same Codex, Claude Code, or Pi CLI your users run.
2. **It runs in isolation.** Each case gets a fresh copy of its fixture and an isolated skill set, so runs are reproducible and failures are inspectable.
3. **It grades evidence, not narration.** Verifier scripts, file diffs, observed tool calls, and skill-load telemetry — never the agent's summary of itself.
4. **It checks cheaply first.** Static validation catches unclear activation text, missing files, and broken tests before a single token is spent.
5. **It bounds cost.** Token budgets turn efficiency regressions into failing tests.

## How Agent Skill Evals solves it

Agent Skill Evals adds exactly those five properties to Promptfoo. Promptfoo stays the runner and reporting UI — you keep using `promptfoo eval` — and Agent Skill Evals supplies the skill-aware setup, static checks, isolated environments, and runtime assertions.

### Check the skill before you pay for a run

```sh
agent-skill-evals check ./skills/bugfix-workflow
```

The static check validates the skill and its Test Pack without invoking any agent. It flags a description that never says *when* to use the skill (the top cause of routing failures), referenced files that don't exist, verifiers that aren't executable, unknown assertions, and missing budgets — in milliseconds, for free.

### Describe tests as outcomes, not transcripts

A Test Pack is plain YAML. This case starts from a fixture, proves the bug exists, runs the agent, and proves both the fix and the blast radius:

```yaml
skill: ../skills/bugfix-workflow
tests:
  - description: fixes the login redirect
    prompt: Fix successful logins so they go to /dashboard.
    fixture: ../fixtures/login-bug
    preconditions:
      - verifier.fails: { run: ./verify_login_redirect.sh }
    expect:
      - verifier.succeeds: { run: ./verify_login_redirect.sh }
      - file.changes_within: { paths: [app.js] }
    budget: { max_total_tokens: 300000 }
```

Read it top to bottom: *before* the agent runs, the verifier must fail (the bug is really there); *after*, the verifier must pass and only `app.js` may have changed. The agent's opinion of its own work never enters into it.

### Isolated Worlds, inspectable failures

Every case runs in a fresh **World** — a disposable directory containing a copy of the fixture and exactly the skills the case declares. Your workspace is never touched. When a case fails, the World and an `evidence.json` recording output, file writes, commands, tool calls, loaded skills, turns, and token usage are retained, so debugging starts from what actually happened rather than from a red X.

### Routing tests that prove selection

Routing cases place the target skill alongside distractor skills and require observed evidence that the right skill was loaded — and that unrelated ones were not:

```yaml
expect:
  - skill.loaded: { skills: [bugfix-workflow] }
  - skill.not_loaded: { skills: [release-notes] }
```

This is the difference between "my skill is installed" and "my skill is what the agent actually used."

### Prove the skill is the difference

A skill that "passes" tells you the agent completed the task — not that the skill helped. `mode: baseline` runs the same prompt and fixture with **no skills installed**, so you can show the lift directly:

```yaml
  - description: without the skill, the workflow is not followed
    mode: baseline
    prompt: Fix successful logins so they go to /dashboard.
    fixture: ../fixtures/login-bug
    expect:
      - verifier.fails: { run: ./verify_workflow_steps.sh }
```

Pair it with the behavior case and Promptfoo's results show skill-on versus skill-off side by side — outcome, turns, and tokens. This is the same "does the skill actually improve behavior versus baseline" question Anthropic's skill-creator evals ask.

### Budgets make cost a test

Declaring `budget` fails the case when the run exceeds a token ceiling. Calibrate it from a representative passing run, and every future edit to the skill is held to that efficiency bar.

### Run trials, not one lucky pass

Agent output is nondeterministic — a single green run can be luck. Because Promptfoo is the runner, repetition comes for free: `promptfoo eval --repeat 3` runs every case multiple times so you judge the distribution, not one sample. Industry guidance ([Schmid](https://www.philschmid.de/testing-skills), [OpenAI](https://developers.openai.com/blog/eval-skills)) recommends 3–5 trials per prompt.

## You don't have to take our word for it

The push toward systematic skill evals is industry-wide. [OpenAI's engineering blog](https://developers.openai.com/blog/eval-skills) defines a skill eval exactly the way this tool works: a prompt, a captured run with trace and artifacts, deterministic checks, and a score you compare over time. Anthropic [built eval modes into skill-creator](https://tessl.io/blog/anthropic-brings-evals-to-skill-creator-heres-why-thats-a-big-deal/) after concluding developers "had zero proof their skills worked." Google engineers are telling teams to [stop vibe-testing their skills](https://medium.com/google-cloud/agent-skills-evals-stop-vibe-testing-your-skills-edd9eaaa6a1a). Agent Skill Evals packages that consensus into one Promptfoo-native workflow for the real agent CLIs your users run.

## What this doesn't do

Agent Skill Evals proves a skill *works* — it does not audit a skill for malicious content. Skill registries are already fighting [supply-chain attacks](https://medium.com/@t79877005/the-ai-agent-skills-boom-is-under-attack-a-deep-security-crisis-3a7b7ded0208); before evaluating a third-party skill, review what it does and use a security scanner. Running evals inside isolated Worlds limits the blast radius, but isolation is a safety net, not a security review.

## Getting started

Install the packages, scaffold an eval for a skill, and pick the agent to test against:

```sh
pnpm add -D agent-skill-evals promptfoo
pnpm exec agent-skill-evals init --skill ./skills/bugfix-workflow --adapter claude-code
pnpm exec agent-skill-evals check ./skills/bugfix-workflow
pnpm exec promptfoo eval
```

`init` creates the Promptfoo wiring and a starter Test Pack; `check` validates everything for free; `promptfoo eval` runs the real agent and grades the evidence. The [Getting Started guide](/guide/getting-started) walks through the first working eval, and the [cross-adapter example](https://github.com/akshay5995/agent-skill-evals/tree/main/examples) runs the same Test Pack against Codex, Claude Code, and Pi.

Skills are products. Give them the tests a product deserves.
