# File And Code Checks

Use these checks when the result should be visible in files.

This example says:

- `src/session.ts` should exist.
- It should contain `redirectAfterLogin`.
- No TypeScript file should contain `console.log`.
- Only `src/session.ts` may change.

```yaml
vars:
  should:
    - file.exists:
        path: src/session.ts
    - file.contains:
        path: src/session.ts
        text: redirectAfterLogin
    - code.no_pattern:
        glob: src/**/*.ts
        pattern: "console\\.log"
  should_not:
    - file.changes_outside_scope:
        scope:
          - src/session.ts
```

Use verifier scripts when a result needs project-specific checks, such as running tests, starting a server, or calling an API.

`file.contains` checks exact text. Use `code.pattern_exists` or `code.no_pattern` when you need regex matching.

See [Runtime Checks](/guide/runtime-checks) for the full list.
