import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

interface JsonlState {
  leftover: string;
  events: unknown[];
}

function appendLine(events: unknown[], line: string): unknown[] {
  if (!line.trim()) return events;
  try {
    return [...events, JSON.parse(line) as unknown];
  } catch {
    return events;
  }
}

function parseChunk(state: JsonlState, text: string): JsonlState {
  const lines = (state.leftover + text).split("\n");
  const leftover = lines.pop() ?? "";
  const events = lines.reduce(appendLine, state.events);
  return { leftover, events };
}

export interface JsonlEventParser {
  push(chunk: string): unknown[];
  finish(): unknown[];
}

export function createJsonlEventParser(): JsonlEventParser {
  let leftover = "";
  return {
    push(chunk) {
      const state = parseChunk({ leftover, events: [] }, chunk);
      leftover = state.leftover;
      return state.events;
    },
    finish() {
      const events = appendLine([], leftover);
      leftover = "";
      return events;
    },
  };
}

export function parseJsonlChunksEffect(
  chunks: Iterable<string>,
): Effect.Effect<unknown[]> {
  return Stream.fromIterable(chunks).pipe(
    Stream.runFold({ leftover: "", events: [] } satisfies JsonlState, parseChunk),
    Effect.map((state) => ({
      ...state,
      events: appendLine(state.events, state.leftover),
    })),
    Effect.map((state) => state.events),
  );
}

export function parseJsonlChunks(chunks: Iterable<string>): unknown[] {
  return Effect.runSync(parseJsonlChunksEffect(chunks));
}
