import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { createTestPackJsonSchema } from "../src/test-pack-json-schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "../schema/test-pack.schema.json");
const schema = createTestPackJsonSchema();

await writeFile(outPath, `${JSON.stringify(schema, null, 2)}\n`);
