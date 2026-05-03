import { join, isAbsolute, resolve } from "node:path";
import { stat } from "node:fs/promises";
import { parseSkillMd, type ParsedSkill } from "./skill.js";
import { parseTestsPack, type ParsedTestsPack } from "./tests-pack.js";

export interface StaticProviderConfig {
  /** Override for the cwd Promptfoo was launched from. */
  baseDir?: string;
  /** Effect types considered "supported" for static cross-checks. */
  knownEffectTypes?: readonly string[];
}

interface PromptfooContext {
  vars?: Record<string, unknown>;
  test?: { vars?: Record<string, unknown> };
}

interface ProviderResponse {
  output: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface StaticProviderMetadata {
  skill: ParsedSkill | null;
  tests: ParsedTestsPack | null;
  /** Combined missing files: skill references + verifier scripts + fixtures. */
  missingFiles: string[];
  /** Effect types referenced by tests but not in `knownEffectTypes`. */
  unresolvedEffectTypes: string[];
  warnings: string[];
}

export const DEFAULT_KNOWN_EFFECT_TYPES: readonly string[] = [
  "verifier.succeeds",
  "verifier.fails",
  "file.exists",
  "file.not_modified",
  "file.contains",
  "code.pattern_exists",
  "code.no_pattern",
  "git.push_to_branch",
  "git.unrelated_changes",
  "secret.read",
  "network.external_call",
  // Phase 3 adds these:
  "mcp.tool_called",
  "mcp.tool_not_called",
  // Phase 5 adds these:
  "conversation.asks_clarification",
  "conversation.asks_confirmation",
  "conversation.refuses_to_proceed",
  "conversation.does_not_over_ask",
];

class SkillKitStaticProvider {
  config: StaticProviderConfig;
  id: () => string;

  constructor(options: { config?: StaticProviderConfig; id?: string } = {}) {
    this.config = options.config ?? {};
    const label = options.id ?? "skillkit-static";
    this.id = () => label;
  }

  async callApi(
    _prompt: string,
    context: PromptfooContext = {},
  ): Promise<ProviderResponse> {
    const vars = (context.vars ?? context.test?.vars ?? {}) as Record<string, unknown>;
    const baseDir = this.config.baseDir ?? process.cwd();
    const knownTypes = new Set<string>(
      this.config.knownEffectTypes ?? DEFAULT_KNOWN_EFFECT_TYPES,
    );

    const skillPath = vars.skillPath as string | undefined;
    const testsGlob = vars.testsGlob as string | undefined;
    const warnings: string[] = [];

    let skill: ParsedSkill | null = null;
    if (skillPath) {
      const skillAbs = isAbsolute(skillPath) ? skillPath : resolve(baseDir, skillPath);
      const skillMd = await ensureSkillMd(skillAbs);
      if (skillMd === null) {
        return {
          output: "",
          error: `skillkit-static: SKILL.md not found at ${skillAbs}`,
        };
      }
      skill = await parseSkillMd(skillMd);
    } else {
      warnings.push("vars.skillPath not provided");
    }

    let tests: ParsedTestsPack | null = null;
    if (testsGlob) {
      tests = await parseTestsPack({ testsGlob, baseDir, knownEffectTypes: knownTypes });
    } else {
      warnings.push("vars.testsGlob not provided");
    }

    const missingFiles: string[] = [];
    if (skill) {
      for (const ref of skill.missingReferences) missingFiles.push(`${skill.skillDir}/${ref}`);
    }
    if (tests) {
      missingFiles.push(...tests.missingVerifierScripts);
      missingFiles.push(...tests.missingFixturePaths);
    }

    const metadata: StaticProviderMetadata = {
      skill,
      tests,
      missingFiles,
      unresolvedEffectTypes: tests?.unresolvedEffectTypes ?? [],
      warnings,
    };

    return {
      output: summarise(metadata),
      metadata: metadata as unknown as Record<string, unknown>,
    };
  }
}

async function ensureSkillMd(skillPath: string): Promise<string | null> {
  // Accept either `…/SKILL.md` directly or a directory containing it.
  try {
    const s = await stat(skillPath);
    if (s.isFile()) return skillPath;
    if (s.isDirectory()) {
      const candidate = join(skillPath, "SKILL.md");
      const cs = await stat(candidate).catch(() => null);
      return cs && cs.isFile() ? candidate : null;
    }
    return null;
  } catch {
    return null;
  }
}

function summarise(m: StaticProviderMetadata): string {
  const parts: string[] = [];
  if (m.skill) parts.push(`skill=${m.skill.frontmatter.name ?? "?"}`);
  if (m.tests) parts.push(`tests=${m.tests.tests.length}`);
  if (m.missingFiles.length) parts.push(`missing=${m.missingFiles.length}`);
  if (m.unresolvedEffectTypes.length) parts.push(`unresolved=${m.unresolvedEffectTypes.length}`);
  return parts.join(" ");
}

export default SkillKitStaticProvider;
export { SkillKitStaticProvider, parseSkillMd, parseTestsPack };
export type { ParsedSkill, ParsedTestsPack };
