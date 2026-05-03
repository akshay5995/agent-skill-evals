import { appendFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { McpCallEvent } from '@skillkit/mcp-core';

export const MCP_EVIDENCE_FILE = 'mcp-calls.jsonl';

export async function recordMcpCall(evidencePath: string, call: Omit<McpCallEvent, 'timestamp'> & { timestamp?: number }): Promise<void> {
  await mkdir(dirname(evidencePath), { recursive: true });
  const event: McpCallEvent = { timestamp: call.timestamp ?? Date.now(), ...call };
  await appendFile(evidencePath, `${JSON.stringify(event)}\n`, 'utf8');
}

export async function readMcpCalls(evidencePath: string): Promise<readonly McpCallEvent[]> {
  try {
    const raw = await readFile(evidencePath, 'utf8');
    return raw.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l) as McpCallEvent);
  } catch {
    return [];
  }
}

export function defaultMcpEvidencePath(runDir: string): string {
  return join(runDir, MCP_EVIDENCE_FILE);
}
