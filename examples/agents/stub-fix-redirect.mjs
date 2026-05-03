#!/usr/bin/env node
// Deterministic Phase 1 example "agent". Reads its prompt from stdin and:
//   - if the prompt mentions "fix" or "redirect", patches app.js so the
//     login redirect goes to /dashboard, then prints a one-line summary;
//   - otherwise, refuses with a short message.
// Used by examples/promptfooconfig.yaml so the E2E eval is hermetic.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  const wantsFix = /\b(fix|repair|correct|patch)\b/i.test(prompt) &&
    /redirect|login/i.test(prompt);
  if (!wantsFix) {
    console.log("stub-agent: nothing to do.");
    return;
  }
  if (!existsSync("app.js")) {
    console.log("stub-agent: app.js not found, refusing.");
    return;
  }
  const before = readFileSync("app.js", "utf8");
  const after = before.replaceAll('"/wrong-path"', '"/dashboard"');
  writeFileSync("app.js", after);
  console.log("stub-agent: patched app.js — login redirect now /dashboard.");
});
