import { z } from "zod";
import { CleanTestPackSchema } from "./test-pack.js";

export const TEST_PACK_SCHEMA_ID =
  "https://akshay5995.github.io/agent-skill-evals/schema/test-pack.schema.json";

type JsonSchemaDocument = Record<string, unknown>;

export function createTestPackJsonSchema(): JsonSchemaDocument {
  const generated = z.toJSONSchema(CleanTestPackSchema, {
    target: "draft-07",
    reused: "ref",
    io: "input",
  }) as JsonSchemaDocument;
  const { $schema, ...schema } = generated;
  return {
    $schema,
    $id: TEST_PACK_SCHEMA_ID,
    ...schema,
  };
}
