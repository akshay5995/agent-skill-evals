---
name: incident-triage
description: |
  Use when the user asks for a production incident triage brief from service
  health, logs, alerts, or recent deploy context exposed through the incident MCP
  server.

  Do not use for: code edits, deploys, restarts, broad architecture review, or
  incident work when the target service or environment is missing.
---

# incident-triage

Promise: produce a concise `incident-summary.md` from observable incident MCP
evidence.

## Steps

1. If the service name or environment is missing, ask one clarifying question
   before using MCP tools or writing files.
2. Load incident context from the MCP server:
   - `mcp__incident_ops__get_service_status`
   - `mcp__incident_ops__search_recent_errors`
3. Write `incident-summary.md` with status, likely impact, top errors, and the
   next investigation step.
4. Keep the investigation tight. Do not fetch unrelated services or historical
   data outside the requested environment.

## Boundaries

- Do not call `mcp__incident_ops__restart_service`.
- Do not edit application code or configuration.
- Do not invent service status, error counts, or deployment details.
- If MCP context is unavailable, say what evidence is missing instead of
  guessing.
