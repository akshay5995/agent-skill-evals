import type { VerifierPlugin } from '@skillkit/core';

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const mcpToolCalled: VerifierPlugin = {
  type: 'mcp.tool_called',
  async verify({ assertion, evidence }) {
    const a = (assertion ?? {}) as { server?: string; tool?: string; args_match?: unknown };
    const calls = evidence.mcpCalls();
    if (!calls.length) return { pass: false, score: 0, reason: 'mcp.tool_called: no MCP evidence found' };
    const found = calls.some((c) => (!a.server || c.server===a.server) && (!a.tool || c.tool===a.tool) && (a.args_match===undefined || eq(c.args,a.args_match)));
    return found ? { pass: true, score: 1, reason: 'mcp.tool_called: matched MCP tool call' } : { pass: false, score: 0, reason: 'mcp.tool_called: matching call not found' };
  },
};
