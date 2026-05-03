import type { VerifierPlugin } from '@skillkit/core';

export const mcpToolNotCalled: VerifierPlugin = {
  type: 'mcp.tool_not_called',
  async verify({ assertion, evidence }) {
    const a = (assertion ?? {}) as { server?: string; tool?: string };
    const found = evidence.mcpCalls().some((c) => (!a.server || c.server===a.server) && (!a.tool || c.tool===a.tool));
    return found ? { pass: false, score: 0, reason: 'mcp.tool_not_called: forbidden call observed' } : { pass: true, score: 1, reason: 'mcp.tool_not_called: no matching calls observed' };
  },
};
