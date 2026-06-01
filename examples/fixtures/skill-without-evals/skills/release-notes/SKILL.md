---
name: release-notes
description: |
  Use when the user asks for release notes, a changelog entry, or a concise
  customer-facing summary from structured product changes.

  Do not use for: bug fixes, code review, slide decks, spreadsheet analysis,
  or broad product strategy work.
---

# release-notes

Promise: turn structured product changes into a short, customer-facing
`CHANGELOG.md` entry.

## Steps

1. Read `changes.json`.
2. Group changes by audience impact: Added, Changed, Fixed.
3. Write `CHANGELOG.md` with a product name, release date, and grouped bullets.
4. Keep the language concrete and non-marketing.

## Boundaries

- Do not edit `changes.json`.
- Do not invent change details not present in the source file.
- Do not fetch remote release data.
