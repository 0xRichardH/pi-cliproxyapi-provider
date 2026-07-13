import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const MODELS_DEV_URL = "https://models.dev/models.json";
const fallbackPath = resolve("data/models-dev-fallback.json");
const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });

function normalizeCatalog(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("models.dev catalog must be a JSON object");
  }

  const catalog = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!value || typeof value !== "object") continue;
    if (typeof value.id === "string") {
      catalog[key] = { ...value, id: value.id.includes("/") ? value.id : key };
      continue;
    }
    if (!value.models || typeof value.models !== "object") continue;
    for (const [modelId, metadata] of Object.entries(value.models)) {
      if (!metadata || typeof metadata !== "object" || typeof metadata.id !== "string") continue;
      const canonicalId = metadata.id.includes("/") ? metadata.id : `${key}/${modelId}`;
      catalog[canonicalId] = { ...metadata, id: canonicalId };
    }
  }

  const entries = Object.entries(catalog).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length < 100) {
    throw new Error(`models.dev catalog contained only ${entries.length} valid models; refusing to replace the fallback`);
  }
  return Object.fromEntries(entries);
}

const response = await fetch(MODELS_DEV_URL, { headers: { Accept: "application/json" } });
if (!response.ok) {
  throw new Error(`models.dev fetch failed: HTTP ${response.status} ${response.statusText}`);
}

const nextCatalog = normalizeCatalog(await response.json());
const content = `${JSON.stringify(nextCatalog)}\n`;
const current = await readFile(fallbackPath, "utf8").catch(() => "");
if (current) {
  const currentCount = Object.keys(JSON.parse(current)).length;
  const nextCount = Object.keys(nextCatalog).length;
  if (nextCount < currentCount * 0.5) {
    throw new Error(`models.dev catalog shrank from ${currentCount} to ${nextCount} models; refusing the update`);
  }
}

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
