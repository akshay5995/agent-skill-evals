import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SkillKitProvider, {
  type SkillKitProviderMetadata,
} from "../index.js";

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), "skillkit-fixture-"));
  writeFileSync(
    join(dir, "app.js"),
    "console.log('redirect=/wrong-path')\n",
  );
  writeFileSync(
    join(dir, "verify.sh"),
    "#!/bin/sh\nout=$(node app.js)\ncase \"$out\" in *right-path*) exit 0;; *) exit 1;; esac\n",
  );
  chmodSync(join(dir, "verify.sh"), 0o755);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function makeStubAgent() {
  const dir = mkdtempSync(join(tmpdir(), "skillkit-stub-"));
  const path = join(dir, "fix.mjs");
  writeFileSync(
    path,
    [
      "import { readFileSync, writeFileSync } from 'node:fs';",
      "const file = 'app.js';",
      "const c = readFileSync(file, 'utf8').replace('/wrong-path', '/right-path');",
      "writeFileSync(file, c);",
      "console.log('Fixed redirect.');",
    ].join("\n"),
  );
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("SkillKitProvider", () => {
  it("copies fixture, runs preconditions, runs agent, records file diff", async () => {
    const fixture = makeFixture();
    const stub = makeStubAgent();
    try {
      const provider = new SkillKitProvider({
        config: {
          adapter: "generic",
          command: "node",
          args: [stub.path],
        },
      });
      const r = await provider.callApi("fix the redirect", {
        vars: {
          skill: "bugfix-workflow",
          kind: "positive",
          fixture: fixture.dir,
          preconditions: [{ "verifier.fails": { run: "./verify.sh" } }],
        },
      });
      expect(r.error).toBeUndefined();
      const meta = r.metadata as unknown as SkillKitProviderMetadata;
      expect(meta.preconditionsPassed).toBe(true);
      expect(meta.preconditionResults).toHaveLength(1);
      expect(meta.preconditionResults[0]!.pass).toBe(true);
      expect(r.output).toMatch(/Fixed redirect/);
    } finally {
      fixture.cleanup();
      stub.cleanup();
    }
  });

  it("short-circuits when preconditions fail", async () => {
    const fixture = makeFixture();
    try {
      const provider = new SkillKitProvider({
        config: {
          adapter: "generic",
          command: "node",
          args: ["-e", "console.log('should not run')"],
        },
      });
      const r = await provider.callApi("anything", {
        vars: {
          fixture: fixture.dir,
          preconditions: [
            { "verifier.succeeds": { run: "./verify.sh" } },
          ],
        },
      });
      const meta = r.metadata as unknown as SkillKitProviderMetadata;
      expect(meta.preconditionsPassed).toBe(false);
      expect(r.output).toBe("");
    } finally {
      fixture.cleanup();
    }
  });

  it("errors when fixture is missing from vars", async () => {
    const provider = new SkillKitProvider({
      config: { adapter: "generic", command: "echo", args: ["hi"] },
    });
    const r = await provider.callApi("p", { vars: {} });
    expect(r.error).toMatch(/fixture/);
  });
});
