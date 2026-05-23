import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { VerifierPlugin } from "../internal-types.js";
import { corePlugins } from "./index.js";

export interface RuntimeCheckCatalogService {
  all(): readonly VerifierPlugin[];
  get(type: string): VerifierPlugin | undefined;
  knownTypes(): ReadonlySet<string>;
}

export class RuntimeCheckCatalog extends Context.Tag("agent-skill-evals/promptfoo/RuntimeCheckCatalog")<
  RuntimeCheckCatalog,
  RuntimeCheckCatalogService
>() {}

export function runtimeCheckCatalogFromChecks(
  checks: readonly VerifierPlugin[] = corePlugins,
): RuntimeCheckCatalogService {
  const registry = new Map<string, VerifierPlugin>();
  for (const check of checks) {
    registry.set(check.type, check);
  }
  return {
    all: () => [...registry.values()],
    get: (type) => registry.get(type),
    knownTypes: () => new Set(registry.keys()),
  };
}

export function makeRuntimeCheckCatalogLayer(
  extraChecks: readonly VerifierPlugin[] = [],
): Layer.Layer<RuntimeCheckCatalog> {
  return Layer.succeed(
    RuntimeCheckCatalog,
    runtimeCheckCatalogFromChecks([...corePlugins, ...extraChecks]),
  );
}

export const RuntimeCheckCatalogLive = makeRuntimeCheckCatalogLayer();

export function getRuntimeCheck(
  type: string,
): Effect.Effect<VerifierPlugin | undefined, never, RuntimeCheckCatalog> {
  return Effect.map(RuntimeCheckCatalog, (catalog) => catalog.get(type));
}

export const getKnownRuntimeCheckTypes: Effect.Effect<ReadonlySet<string>, never, RuntimeCheckCatalog> =
  Effect.map(RuntimeCheckCatalog, (catalog) => catalog.knownTypes());
