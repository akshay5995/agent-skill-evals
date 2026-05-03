import { fail, getStaticMeta, pass, type GradingResult, type PromptfooAssertContext } from "./_shared.js";

/**
 * SPEC §7.5 — tests using mcp.* assertions must declare an evidence source.
 *
 * `vars.evidenceSources` lists configured sources, e.g.
 *   ["claude-stream-json", "mcp-recorder", "mcp-mock"]
 * The check passes if any source is declared, OR no test uses mcp.*
 * assertions.
 */
export default async function mcpEvidence(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = getStaticMeta(context);
  if (!meta) return fail("mcp-evidence: provider metadata missing");
  const tests = meta.tests;
  if (!tests) return fail("mcp-evidence: tests not parsed");

  const vars = (context.vars ?? context.test?.vars ?? {}) as Record<string, unknown>;
  const sources = Array.isArray(vars.evidenceSources)
    ? (vars.evidenceSources as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  const usingMcp = tests.tests.filter((t) => t.usesMcpAssertions);
  if (usingMcp.length === 0) {
    return pass("mcp-evidence: no mcp.* assertions, no evidence source needed");
  }
  if (sources.length === 0) {
    return fail(
      `mcp-evidence: ${usingMcp.length} test(s) use mcp.* assertions but vars.evidenceSources is empty (fail-closed by default)`,
    );
  }
  const knownMcp = ["claude-stream-json", "mcp-recorder", "mcp-mock", "mcp-aimock", "otel-mcp"];
  const valid = sources.some((s) => knownMcp.includes(s));
  if (!valid) {
    return fail(
      `mcp-evidence: vars.evidenceSources [${sources.join(", ")}] does not include any MCP-aware source (${knownMcp.join(", ")})`,
    );
  }
  return pass(`mcp-evidence: ${usingMcp.length} mcp test(s) covered by [${sources.join(", ")}]`);
}
