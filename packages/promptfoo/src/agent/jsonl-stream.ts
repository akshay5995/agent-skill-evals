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

export function parseJsonlChunks(chunks: Iterable<string>): unknown[] {
  let state: JsonlState = { leftover: "", events: [] };
  for (const chunk of chunks) {
    state = parseChunk(state, chunk);
  }
  return appendLine(state.events, state.leftover);
}
