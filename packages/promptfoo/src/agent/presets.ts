/**
 * Agent presets: known-good CLI invocations per supported agent.
 *
 * A preset owns the harness wiring (adapter, command, flags) so test authors
 * write `preset: codex` instead of hand-typing flag lists that drift as the
 * CLIs change. Every field stays overridable in provider config, and
 * `extraArgs` appends run-specific flags without re-declaring the base list.
 */

export interface AgentPreset {
  /** Adapter id registered in the adapter catalog. */
  adapter: string;
  /** Executable name or path. */
  command: string;
  /** Known-good argument list for noninteractive eval runs. */
  args: readonly string[];
  /**
   * Human-readable note about the CLI version range this preset was written
   * against. Surfaced in stale-flag error messages, never enforced.
   */
  testedAgainst: string;
}

export const AGENT_PRESETS: Readonly<Record<string, AgentPreset>> = {
  codex: {
    adapter: "codex-json",
    command: "codex",
    args: [
      "--ask-for-approval",
      "never",
      "exec",
      "--json",
      "--sandbox",
      "workspace-write",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "-",
    ],
    testedAgainst: "Codex CLI 0.13x (exec --json)",
  },
  "claude-code": {
    adapter: "claude-code-json",
    command: "claude",
    args: [
      "-p",
      "--permission-mode",
      "bypassPermissions",
      "--output-format",
      "stream-json",
      "--verbose",
      "--no-session-persistence",
    ],
    testedAgainst: "Claude Code CLI 2.x (-p --output-format stream-json)",
  },
  pi: {
    adapter: "pi-json",
    command: "pi",
    args: ["--mode", "json"],
    testedAgainst: "Pi CLI (--mode json)",
  },
};

export const PRESET_IDS = Object.keys(AGENT_PRESETS);

export interface ResolvedInvocation {
  adapter?: string;
  command?: string;
  args?: readonly string[];
  preset?: string;
}

export interface PresetInput {
  preset?: string;
  adapter?: string;
  command?: string;
  args?: readonly string[];
  extraArgs?: readonly string[];
}

/**
 * Merge a preset with explicit config. Explicit `adapter`/`command`/`args`
 * always win over the preset. `extraArgs` appends to whichever args list was
 * chosen; when that list ends with a lone `-` (prompt-on-stdin marker, e.g.
 * Codex), the extra args are inserted before it so the marker stays last.
 */
export function resolveInvocation(
  input: PresetInput,
): ResolvedInvocation | { error: string } {
  const preset = input.preset ? AGENT_PRESETS[input.preset] : undefined;
  if (input.preset && !preset) {
    return {
      error:
        `unknown preset "${input.preset}". Supported presets: ${PRESET_IDS.join(", ")}. ` +
        "Use adapter/command/args directly for a custom agent.",
    };
  }

  const args = input.args ?? preset?.args;
  const merged: ResolvedInvocation = {
    ...(input.adapter ?? preset?.adapter
      ? { adapter: input.adapter ?? preset?.adapter }
      : {}),
    ...(input.command ?? preset?.command
      ? { command: input.command ?? preset?.command }
      : {}),
    ...(args ? { args } : {}),
    ...(input.preset ? { preset: input.preset } : {}),
  };

  if (input.extraArgs && input.extraArgs.length > 0) {
    const base = [...(merged.args ?? [])];
    if (base.length > 0 && base[base.length - 1] === "-") {
      merged.args = [...base.slice(0, -1), ...input.extraArgs, "-"];
    } else {
      merged.args = [...base, ...input.extraArgs];
    }
  }

  return merged;
}

/** The note shown when a spawn fails and the config came from a preset. */
export function presetStalenessHint(presetId: string | undefined): string {
  if (!presetId) return "";
  const preset = AGENT_PRESETS[presetId];
  if (!preset) return "";
  return ` The "${presetId}" preset was tested against ${preset.testedAgainst}; if the CLI updated recently its flags may have changed.`;
}
