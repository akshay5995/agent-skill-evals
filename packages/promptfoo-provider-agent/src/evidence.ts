import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CommandEvent,
  EvidenceHandle,
  FileEvent,
  NetworkEvent,
  SecretEvent,
  ToolCallEvent,
  Usage,
  McpCallEvent,
} from "@skillkit/core";

export interface EvidenceSnapshot {
  commands: CommandEvent[];
  filesWritten: FileEvent[];
  networkCalls: NetworkEvent[];
  secretsAccessed: SecretEvent[];
  toolCalls: ToolCallEvent[];
  usage: Usage;
  mcpCalls: McpCallEvent[];
}

export class EvidenceCollector {
  private snapshot: EvidenceSnapshot = {
    commands: [],
    filesWritten: [],
    networkCalls: [],
    secretsAccessed: [],
    toolCalls: [],
    usage: {},
    mcpCalls: [],
  };

  addCommand(e: CommandEvent): void {
    this.snapshot.commands.push(e);
  }

  addFileWrite(e: FileEvent): void {
    this.snapshot.filesWritten.push(e);
  }

  addToolCall(e: ToolCallEvent): void {
    this.snapshot.toolCalls.push(e);
  }

  addNetworkCall(e: NetworkEvent): void {
    this.snapshot.networkCalls.push(e);
  }

  addSecret(e: SecretEvent): void {
    this.snapshot.secretsAccessed.push(e);
  }

  setUsage(u: Usage): void {
    this.snapshot.usage = u;
  }

  addMcpCall(e: McpCallEvent): void {
    this.snapshot.mcpCalls.push(e);
  }

  toSnapshot(): EvidenceSnapshot {
    return {
      commands: [...this.snapshot.commands],
      filesWritten: [...this.snapshot.filesWritten],
      networkCalls: [...this.snapshot.networkCalls],
      secretsAccessed: [...this.snapshot.secretsAccessed],
      toolCalls: [...this.snapshot.toolCalls],
      usage: { ...this.snapshot.usage },
      mcpCalls: [...this.snapshot.mcpCalls],
    };
  }

  async writeTo(runDir: string): Promise<string> {
    const path = join(runDir, "evidence.json");
    await writeFile(path, JSON.stringify(this.toSnapshot(), null, 2));
    return path;
  }
}

export function evidenceFromSnapshot(s: EvidenceSnapshot): EvidenceHandle {
  return {
    commands: () => s.commands,
    filesWritten: () => s.filesWritten,
    networkCalls: () => s.networkCalls,
    secretsAccessed: () => s.secretsAccessed,
    toolCalls: () => s.toolCalls,
    usage: () => s.usage,
    mcpCalls: () => s.mcpCalls,
  };
}
