import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function normalizeCatalog(payload: Record<string, any>): Record<string, any> {
  const catalog: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!value || typeof value !== "object") continue;
    if (typeof value.id === "string") {
      catalog[key] = { ...value, id: value.id.includes("/") ? value.id : key };
      continue;
    }
    if (!value.models || typeof value.models !== "object") continue;
    for (const [modelId, metadata] of Object.entries(value.models as Record<string, any>)) {
      if (!metadata || typeof metadata !== "object" || typeof metadata.id !== "string") continue;
      const canonicalId = metadata.id.includes("/") ? metadata.id : `${key}/${modelId}`;
      catalog[canonicalId] = { ...metadata, id: canonicalId };
    }
  }
  return Object.fromEntries(Object.entries(catalog).sort(([left], [right]) => left.localeCompare(right)));
}

test("models.dev updater supports flat and provider-organized catalogs", () => {
  const normalized = normalizeCatalog({
    "xai/grok": { id: "xai/grok", reasoning: true },
    openai: { models: { gpt: { id: "gpt", reasoning: true } } },
  });

  assert.deepEqual(Object.keys(normalized), ["openai/gpt", "xai/grok"]);
  assert.equal(normalized["openai/gpt"].id, "openai/gpt");
});

test("daily workflow is scheduled and conditionally publishes changed or pending releases", async () => {
  const workflow = await readFile(".github/workflows/update-models-dev.yml", "utf8");

  assert.match(workflow, /cron: "17 3 \* \* \*"/);
  assert.match(workflow, /npm version patch --no-git-tag-version/);
  assert.match(workflow, /npm publish --access public --provenance/);
  assert.match(workflow, /Detect unpublished automatic release/);
  assert.match(workflow, /steps\.release\.outputs\.publish == 'true'/);
});
