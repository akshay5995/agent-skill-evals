import { fail, getStaticMeta, pass, type GradingResult, type PromptfooAssertContext } from "./_shared.js";

const GENERIC_PHRASES = [
  /\bhelp(s|ing)?\b/i,
  /\bgithub workflows?\b/i,
  /\bvarious\b/i,
  /\bany kind of\b/i,
];

const WHEN_TO_USE_RE = /\b(use when|use this|when (?:the )?(?:user|you))\b/i;
const WHEN_NOT_RE = /\bdo not use|do not invoke|don'?t use|not for|avoid using\b/i;

/**
 * SPEC §7.1 — routing metadata hard checks.
 */
export default async function routingMetadata(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = getStaticMeta(context);
  if (!meta) return fail("routing-metadata: provider metadata missing");
  const skill = meta.skill;
  if (!skill) return fail("routing-metadata: skill not parsed (vars.skillPath missing?)");

  const fm = skill.frontmatter;
  const components: GradingResult["componentResults"] = [];

  const name = typeof fm.name === "string" ? fm.name.trim() : "";
  components.push({
    pass: name.length > 0,
    score: name.length > 0 ? 1 : 0,
    reason: name ? `name: ${name}` : "missing `name` frontmatter",
  });

  const desc = typeof fm.description === "string" ? fm.description.trim() : "";
  components.push({
    pass: desc.length > 0,
    score: desc.length > 0 ? 1 : 0,
    reason: desc ? `description present (${desc.length} chars)` : "missing `description` frontmatter",
  });

  const sayWhen = WHEN_TO_USE_RE.test(desc);
  components.push({
    pass: sayWhen,
    score: sayWhen ? 1 : 0,
    reason: sayWhen ? "description says when to use" : "description does not say when to use (e.g. 'Use when …')",
  });

  const sayWhenNot = WHEN_NOT_RE.test(desc);
  components.push({
    pass: sayWhenNot,
    score: sayWhenNot ? 1 : 0,
    reason: sayWhenNot ? "description says when not to use" : "description does not say when not to use (e.g. 'Do not use for …')",
  });

  const generic = GENERIC_PHRASES.some((re) => re.test(desc)) && desc.length < 80;
  components.push({
    pass: !generic,
    score: generic ? 0 : 1,
    reason: generic ? "description is too generic" : "description is specific enough",
  });

  const failed = components.filter((c) => !c.pass);
  if (failed.length === 0) {
    return pass(`routing-metadata: ${components.length}/${components.length} checks ok`, components);
  }
  return fail(
    failed.map((f) => `✗ ${f.reason}`).join("; "),
    components,
  );
}
