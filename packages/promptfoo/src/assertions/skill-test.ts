import * as Either from "effect/Either";
import * as Effect from "effect/Effect";
import {
  aggregate,
  loadEvidenceEffect,
  loadMetadataEffect,
  loadWorld,
  runEntriesEffect,
  type GradingResult,
  type PromptfooAssertContext,
} from "./_shared.js";
import { parseRuntimeTestFields } from "../assertion-entries.js";
import { writeEvidenceToEffect } from "../agent/evidence.js";
import {
  Environment,
  FileSystem,
  NodeServicesLive,
} from "../internal-services.js";
import {
  RuntimeCheckCatalog,
  RuntimeCheckCatalogLive,
} from "../runtime-checks/catalog.js";

export default async function skillTest(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  return Effect.runPromise(
    skillTestEffect(_output, context).pipe(
      Effect.provide(RuntimeCheckCatalogLive),
      Effect.provide(NodeServicesLive),
    ),
  );
}

function skillTestEffect(
  _output: string,
  context: PromptfooAssertContext,
): Effect.Effect<GradingResult, never, FileSystem | Environment | RuntimeCheckCatalog> {
  return Effect.gen(function* () {
    const meta = yield* loadMetadataEffect(context);
    if (!meta) {
      return {
        pass: false,
        score: 0,
        reason: "skill.test: provider metadata missing",
      };
    }

    const preconditionResults = meta.preconditionResults ?? [];
    if (!meta.preconditionsPassed) {
      return aggregate(preconditionResults, "skill.test: preconditions failed");
    }

    const vars = (context.vars ?? context.test?.vars ?? {}) as Record<string, unknown>;
    const loadedEvidence = yield* Effect.either(loadEvidenceEffect(meta));
    if (Either.isLeft(loadedEvidence)) {
      const err = loadedEvidence.left;
      return { pass: false, score: 0, reason: err instanceof Error ? err.message : String(err) };
    }
    const evidenceCollector = loadedEvidence.right;
    const world = loadWorld(meta, evidenceCollector);

    const parsed = parseRuntimeTestFields(vars);
    const parseResults = parsed.errors
      .filter((error) => error.field !== "preconditions")
      .map((error) => ({
        pass: false,
        score: 0,
        reason: `runtime test field ${error.index === undefined ? error.field : `${error.field}[${error.index}]`}: ${error.reason}`,
      }));
    const shouldResults = yield* runEntriesEffect(parsed.should, world, evidenceCollector, "should");
    const shouldNotResults = yield* runEntriesEffect(parsed.should_not, world, evidenceCollector, "should_not");
    yield* writeEvidenceToEffect(evidenceCollector, meta.runDir).pipe(Effect.orDie);
    const results = [...preconditionResults, ...parseResults, ...shouldResults, ...shouldNotResults];
    return aggregate(results, "skill.test: no Runtime Test Fields checks declared", {
      emptyPass: false,
    });
  });
}
