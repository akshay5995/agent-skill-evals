# Bugfix Example

This is the smallest included example. It tests a skill that fixes a login redirect bug.

Save the test as `tests/bugfix-workflow.yaml` and reference it from a Promptfoo config such as `promptfoo.codex.yaml`.

The sample project starts broken. The verifier fails before the agent runs, then passes after the agent fixes the copy.

```yaml
- description: fixes login redirect
  vars:
    prompt: Fix the login redirect after sign in.
    fixture: ./fixtures/login-bug
    preconditions:
      - verifier.fails:
          run: ./verify_login_redirect.sh
    should:
      - verifier.succeeds:
          run: ./verify_login_redirect.sh
      - file.contains:
          path: app.js
          text: /dashboard
    should_not:
      - file.changes_outside_scope:
          scope:
            - app.js
  assert:
    - type: javascript
      metric: skill.test
      value: file://./agent-skill-evals/assertions.js
      config:
        metric: skill.test
```

This test checks:

- The bug exists before the agent runs.
- The verifier passes after the agent runs.
- `app.js` contains the expected redirect target.
- No files outside `app.js` changed.

See the runnable version in `examples/tests/bugfix-workflow.yaml`.

For a larger example, see [Brand Deck Example](/examples/brand-deck-skill).
