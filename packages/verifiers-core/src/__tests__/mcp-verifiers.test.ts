import { describe, it, expect } from 'vitest';
import { mcpToolCalled } from '../mcp-tool-called.js';
import { mcpToolNotCalled } from '../mcp-tool-not-called.js';

const ctx = (calls: any[]) => ({ assertion: {}, world: {} as any, mode: 'should' as const, evidence: { commands:()=>[], filesWritten:()=>[], networkCalls:()=>[], secretsAccessed:()=>[], toolCalls:()=>[], mcpCalls:()=>calls, usage:()=>({}) } });

describe('mcp verifiers', () => {
  it('matches called tool', async () => {
    const r = await mcpToolCalled.verify({ ...ctx([{ server:'github', tool:'create_pull_request', args:{title:'x'} }]), assertion:{ server:'github', tool:'create_pull_request' } } as any);
    expect(r.pass).toBe(true);
  });
  it('fails closed when no evidence', async () => {
    const r = await mcpToolCalled.verify({ ...ctx([]), assertion:{ tool:'create_pull_request' } } as any);
    expect(r.pass).toBe(false);
  });
  it('not-called fails when seen', async () => {
    const r = await mcpToolNotCalled.verify({ ...ctx([{ server:'github', tool:'create_pull_request' }]), assertion:{ server:'github', tool:'create_pull_request' } } as any);
    expect(r.pass).toBe(false);
  });
});
