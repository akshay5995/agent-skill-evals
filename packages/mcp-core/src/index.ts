export interface McpServerSpec {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: readonly string[];
  url?: string;
}

export interface McpConfig {
  recorder?: boolean;
  servers?: readonly McpServerSpec[];
}

export interface McpCallEvent {
  timestamp: number;
  server: string;
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
}

export interface McpMockSession {
  record(call: Omit<McpCallEvent, 'timestamp'> & { timestamp?: number }): Promise<void>;
  readAll(): Promise<readonly McpCallEvent[]>;
}

export interface McpMockProvider {
  createSession(opts: { evidencePath: string }): Promise<McpMockSession>;
}
