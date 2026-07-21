import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type {
  EvidenceHandle,
  FileEvent,
  SkillLoadEvent,
  SkillAvailableEvent,
  ToolCallEvent,
  Usage,
  CommandEvent,
} from "../internal-types.js";
import {
  EVIDENCE_SCHEMA_VERSION,
  parseEvidenceSnapshot,
  type EvidenceSnapshot,
  type RuntimeIdentity,
  type TurnRecord,
} from "../evidence-schema.js";
import type { SkillEvidenceConfig } from "./provider-config.js";
import { RESERVED_SKILL_SERVER_MOCK_NAME } from "../test-pack.js";

export type { EvidenceSnapshot };
export type { SkillEvidenceConfig } from "./provider-config.js";

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
  private currentTurn?: number;
  /** Usage from completed turns; the live snapshot.usage covers only the current turn. */
  private completedTurnsUsage: Usage = {};
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
    skillsAvailable: [],
    usage: {},
  };

  constructor(skillEvidenceConfig: SkillEvidenceConfig = {}) {
    this.skillEvidenceConfig = mergeSkillEvidenceConfig(skillEvidenceConfig);
  }

  addCommand(e: CommandEvent): void {
    this.snapshot.commands.push(this.withTurn(e));
  }

  addFileWrite(e: FileEvent): void {
    this.snapshot.filesWritten.push(e);
  }

  addToolCall(e: ToolCallEvent): void {
    const event = this.withTurn(e);
    this.snapshot.toolCalls.push(event);
    const availableSkills = new Set(this.snapshot.skillsAvailable.map((skill) => skill.skill));
    const skillLoad = skillLoadFromToolCall(event, this.skillEvidenceConfig, availableSkills);
    if (skillLoad) this.addSkillLoad(skillLoad);
  }

  private withTurn<T extends { turn?: number }>(event: T): T {
    return this.currentTurn === undefined ? event : { ...event, turn: this.currentTurn };
  }

  /**
   * Start an agent turn in a multi-turn run. Adapters overwrite usage per
   * CLI invocation (setUsage), so each turn's usage is scoped: the previous
   * turn's counts move into the completed-turns total first.
   */
  beginAgentTurn(turn: number): void {
    this.completedTurnsUsage = mergeUsage(this.completedTurnsUsage, this.snapshot.usage);
    this.snapshot.usage = {};
    this.currentTurn = turn;
  }

  endAgentTurn(record: { text: string; startedAt: number; durationMs: number }): void {
    if (this.currentTurn === undefined) return;
    this.addTurnRecord({
      turn: this.currentTurn,
      role: "agent",
      text: record.text,
      startedAt: record.startedAt,
      durationMs: record.durationMs,
      usage: { ...this.snapshot.usage },
    });
  }

  addUserTurn(turn: number, text: string, startedAt: number): void {
    this.addTurnRecord({ turn, role: "user", text, startedAt, durationMs: 0 });
  }

  private addTurnRecord(record: TurnRecord): void {
    const turns = this.snapshot.turns ?? [];
    turns.push(record);
    this.snapshot.turns = turns;
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

  addSkillAvailable(e: SkillAvailableEvent): void {
    if (!this.snapshot.skillsAvailable.some((existing) => existing.skill === e.skill && existing.path === e.path)) {
      this.snapshot.skillsAvailable.push(e);
    }
  }

  setUsage(u: Usage): void {
    this.snapshot.usage = u;
  }

  /** Merge non-empty runtime identity fields; later observations win. */
  mergeRuntime(identity: RuntimeIdentity): void {
    const merged: RuntimeIdentity = { ...this.snapshot.runtime };
    for (const [key, value] of Object.entries(identity)) {
      if (typeof value === "string" && value.length > 0) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
    if (Object.keys(merged).length > 0) this.snapshot.runtime = merged;
  }

  addWarning(warning: string): void {
    const warnings = this.snapshot.warnings ?? [];
    if (warnings.includes(warning)) return;
    warnings.push(warning);
    this.snapshot.warnings = warnings;
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
      skillsAvailable: [...this.snapshot.skillsAvailable],
      usage: mergeUsage(this.completedTurnsUsage, this.snapshot.usage),
      turns: this.snapshot.turns ? this.snapshot.turns.map((t) => ({ ...t })) : undefined,
      runtime: this.snapshot.runtime ? { ...this.snapshot.runtime } : undefined,
      warnings: this.snapshot.warnings ? [...this.snapshot.warnings] : undefined,
      extensions: this.snapshot.extensions ? { ...this.snapshot.extensions } : undefined,
    });
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
  availableSkills: ReadonlySet<string>,
): SkillLoadEvent | undefined {
  // The built-in skill server registers each declared skill as a tool named
  // exactly after the skill, so no pattern is needed there: match the tool
  // name directly, but only against skills actually declared for this run
  // (so an unrelated user MCP mock that happens to reuse the "skills" name
  // outside MCP delivery can't be misread as a skill load).
  if (event.server === RESERVED_SKILL_SERVER_MOCK_NAME && availableSkills.has(event.tool)) {
    return {
      skill: event.tool,
      delivery: "mcp",
      ...(event.provider ? { provider: event.provider } : {}),
      server: event.server,
      source: event.tool,
      startedAt: event.startedAt,
    };
  }
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

export async function writeEvidenceTo(
  collector: EvidenceCollector,
  runDir: string,
): Promise<string> {
  const path = join(runDir, "evidence.json");
  await writeFile(path, JSON.stringify(collector.toSnapshot(), null, 2));
  return path;
}

export function evidenceFromSnapshot(s: EvidenceSnapshot): EvidenceHandle {
  return {
    output: () => s.output,
    commands: () => s.commands,
    filesWritten: () => s.filesWritten,
    toolCalls: () => s.toolCalls,
    skillsLoaded: () => s.skillsLoaded,
    skillsAvailable: () => s.skillsAvailable,
    usage: () => s.usage,
    turns: () => s.turns ?? [],
    runtime: () => s.runtime ?? {},
    warnings: () => s.warnings ?? [],
  };
}
