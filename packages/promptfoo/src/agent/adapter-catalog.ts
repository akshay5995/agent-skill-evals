import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { adapterRegistry, type Adapter } from "./adapters.js";

export interface AdapterCatalogService {
  get(id: string): Adapter | undefined;
}

export class AdapterCatalog extends Context.Tag("agent-skill-evals/promptfoo/AdapterCatalog")<
  AdapterCatalog,
  AdapterCatalogService
>() {}

export const AdapterCatalogLive = Layer.succeed(AdapterCatalog, {
  get: (id) => adapterRegistry.get(id),
});

export function getAdapter(
  id: string,
): Effect.Effect<Adapter | undefined, never, AdapterCatalog> {
  return Effect.map(AdapterCatalog, (catalog) => catalog.get(id));
}
