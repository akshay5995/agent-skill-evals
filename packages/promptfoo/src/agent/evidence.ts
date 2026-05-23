import { join } from "node:path";
import * as Effect from "effect/Effect";
import type {
  EvidenceHandle,
  FileEvent,
  SkillLoadEvent,
  ToolCallEvent,
  Usage,
  CommandEvent,
} from "../internal-types.js";
import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceSnapshot,
} from "../evidence-types.js";
import { parseEvidenceSnapshot } from "../evidence-schema.js";
import { FileSystem, NodeServicesLive } from "../internal-services.js";

export type { EvidenceSnapshot };

export interface SkillEvidenceConfig {
  mcpResource?: {
    uriArgPaths?: readonly string[];
    uriPatterns?: readonly string[];
  };
  mcpTool?: {
    toolPatterns?: readonly string[];
  };
  nativeArgs?: {
    whenArgs?: readonly string[];
    whenAnyArgs?: readonly string[];
    skillPathFlags?: readonly string[];
    provider?: string;
    source?: string;
  };
}

const DEFAULT_SKILL_EVIDENCE_CONFIG = {
  mcpResource: {
    uriArgPaths: ["uri"],
    uriPatterns: ["^skill://(?<skill>[^/]+)/SKILL\\.md$"],
  },
  mcpTool: {
    toolPatterns: ["^load_(?<skill>[A-Za-z0-9_-]+)_skill$"],
  },
} as const satisfies SkillEvidenceConfig;

export class EvidenceCollector {
  private readonly skillEvidenceConfig: SkillEvidenceConfig;
  private snapshot: EvidenceSnapshot = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    output: "",
    run: {
      runDir: "",
      worldPath: "",
      fixture: "",
    },
    commands: [],
    filesWritten: [],
    toolCalls: [],
    skillsLoaded: [],
    usage: {},
  };

  constructor(skillEvidenceConfig: SkillEvidenceConfig = {}) {
    this.skillEvidenceConfig = mergeSkillEvidenceConfig(skillEvidenceConfig);
  }

  addCommand(e: CommandEvent): void {
    this.snapshot.commands.push(e);
  }

  addFileWrite(e: FileEvent): void {
    this.snapshot.filesWritten.push(e);
  }

  addToolCall(e: ToolCallEvent): void {
    this.snapshot.toolCalls.push(e);
    const skillLoad = skillLoadFromToolCall(e, this.skillEvidenceConfig);
    if (skillLoad) this.addSkillLoad(skillLoad);
  }

  addSkillLoad(e: SkillLoadEvent): void {
    const exists = this.snapshot.skillsLoaded.some((existing) =>
      existing.skill === e.skill &&
      existing.delivery === e.delivery &&
      existing.provider === e.provider &&
      existing.server === e.server
    );
    if (exists) return;
    this.snapshot.skillsLoaded.push(e);
  }

  setUsage(u: Usage): void {
    this.snapshot.usage = u;
  }

  addUsage(u: Usage): void {
    this.snapshot.usage = mergeUsage(this.snapshot.usage, u);
  }

  setOutput(output: string): void {
    this.snapshot.output = output;
  }

  setRun(run: EvidenceSnapshot["run"]): void {
    this.snapshot.run = run;
  }

  toSnapshot(): EvidenceSnapshot {
    return parseEvidenceSnapshot({
      schemaVersion: this.snapshot.schemaVersion,
      output: this.snapshot.output,
      run: { ...this.snapshot.run },
      commands: [...this.snapshot.commands],
      filesWritten: [...this.snapshot.filesWritten],
      toolCalls: [...this.snapshot.toolCalls],
      skillsLoaded: [...this.snapshot.skillsLoaded],
      usage: { ...this.snapshot.usage },
      extensions: this.snapshot.extensions ? { ...this.snapshot.extensions } : undefined,
    });
  }

  async writeTo(runDir: string): Promise<string> {
    return Effect.runPromise(writeEvidenceToEffect(this, runDir).pipe(Effect.provide(NodeServicesLive)));
  }

  static fromSnapshot(snapshot: EvidenceSnapshot): EvidenceCollector {
    const collector = new EvidenceCollector();
    collector.snapshot = parseEvidenceSnapshot(snapshot);
    return collector;
  }
}

function mergeSkillEvidenceConfig(config: SkillEvidenceConfig): SkillEvidenceConfig {
  return {
    mcpResource: {
      uriArgPaths: config.mcpResource?.uriArgPaths ?? DEFAULT_SKILL_EVIDENCE_CONFIG.mcpResource.uriArgPaths,
      uriPatterns: config.mcpResource?.uriPatterns ?? DEFAULT_SKILL_EVIDENCE_CONFIG.mcpResource.uriPatterns,
    },
    mcpTool: {
      toolPatterns: config.mcpTool?.toolPatterns ?? DEFAULT_SKILL_EVIDENCE_CONFIG.mcpTool.toolPatterns,
    },
    ...(config.nativeArgs ? { nativeArgs: config.nativeArgs } : {}),
  };
}

function skillLoadFromToolCall(
  event: ToolCallEvent,
  config: SkillEvidenceConfig,
): SkillLoadEvent | undefined {
  const uri = skillUriFromArgs(event.args, config.mcpResource?.uriArgPaths ?? []);
  const skill = uri
    ? skillFromPattern(uri, config.mcpResource?.uriPatterns ?? [])
    : skillFromTool(event.tool, config.mcpTool?.toolPatterns ?? []);
  if (!skill) return undefined;
  const server = event.server ?? serverFromArgs(event.args);
  return {
    skill,
    delivery: "mcp",
    ...(event.provider ? { provider: event.provider } : {}),
    ...(server ? { server } : {}),
    source: event.tool,
    startedAt: event.startedAt,
  };
}

function skillUriFromArgs(args: unknown, paths: readonly string[]): string | undefined {
  for (const path of paths) {
    const uri = valueAtPath(args, path);
    if (typeof uri === "string") return uri;
  }
  return undefined;
}

function serverFromArgs(args: unknown): string | undefined {
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const server = (args as Record<string, unknown>).server;
  return typeof server === "string" ? server : undefined;
}

function skillFromPattern(value: string, patterns: readonly string[]): string | undefined {
  for (const pattern of patterns) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "i");
    } catch {
      continue;
    }
    const match = regex.exec(value);
    const skill = match?.groups?.skill ?? match?.[1];
    if (skill) return skill;
  }
  return undefined;
}

function skillFromTool(tool: string, patterns: readonly string[]): string | undefined {
  const skill = skillFromPattern(tool, patterns);
  return skill?.replace(/_/g, "-");
}

function valueAtPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function addOptionalNumbers(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a + b;
}

function mergeUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: addOptionalNumbers(a.inputTokens, b.inputTokens),
    outputTokens: addOptionalNumbers(a.outputTokens, b.outputTokens),
    totalTokens: addOptionalNumbers(a.totalTokens, b.totalTokens),
    cacheReadTokens: addOptionalNumbers(a.cacheReadTokens, b.cacheReadTokens),
    cacheWriteTokens: addOptionalNumbers(a.cacheWriteTokens, b.cacheWriteTokens),
  };
}

export function writeEvidenceToEffect(
  collector: EvidenceCollector,
  runDir: string,
): Effect.Effect<string, unknown, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const path = join(runDir, "evidence.json");
    yield* fs.writeText(path, JSON.stringify(collector.toSnapshot(), null, 2));
    return path;
  });
}

export function evidenceFromSnapshot(s: EvidenceSnapshot): EvidenceHandle {
  return {
    commands: () => s.commands,
    filesWritten: () => s.filesWritten,
    toolCalls: () => s.toolCalls,
    skillsLoaded: () => s.skillsLoaded,
    usage: () => s.usage,
  };
}
