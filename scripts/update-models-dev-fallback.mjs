import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { normalizeModelsDevCatalog, validateCatalogSize } from "./models-dev-catalog.mjs";

const MODELS_DEV_URL = "https://models.dev/models.json";
const fallbackPath = resolve("data/models-dev-fallback.json");
const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });

const response = await fetch(MODELS_DEV_URL, { headers: { Accept: "application/json" } });
if (!response.ok) {
  throw new Error(`models.dev fetch failed: HTTP ${response.status} ${response.statusText}`);
}

const nextCatalog = normalizeModelsDevCatalog(await response.json());
const content = `${JSON.stringify(nextCatalog)}\n`;
const current = await readFile(fallbackPath, "utf8").catch(() => "");
if (current) validateCatalogSize(JSON.parse(current), nextCatalog);

if (values.check) {
  if (current !== content) {
    console.error("data/models-dev-fallback.json is out of date");
    process.exitCode = 1;
  } else {
    console.log("data/models-dev-fallback.json is current");
  }
} else if (current === content) {
  console.log("data/models-dev-fallback.json is already current");
} else {
  await writeFile(fallbackPath, content);
  console.log(`Updated data/models-dev-fallback.json (${Object.keys(nextCatalog).length} models)`);
}
