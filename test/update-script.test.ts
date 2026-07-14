import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeModelsDevCatalog, validateCatalogSize } from "../scripts/models-dev-catalog.mjs";

function filler(count: number): Record<string, { id: string }> {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`provider/model-${index}`, { id: `provider/model-${index}` }]));
}

test("models.dev updater supports flat and provider-organized catalogs", () => {
  const normalized = normalizeModelsDevCatalog({
    ...filler(100),
    "xai/grok": { id: "xai/grok", reasoning: true },
    openai: { models: { gpt: { id: "gpt", reasoning: true } } },
  });

  assert.equal(normalized["openai/gpt"].id, "openai/gpt");
  assert.equal(normalized["xai/grok"].reasoning, true);
});

test("models.dev updater rejects catastrophic catalog shrinkage", () => {
  assert.throws(() => validateCatalogSize(filler(200), filler(50)), /shrank from 200 to 50/);
});

test("daily workflow bumps the version and dispatches the release workflow", async () => {
  const workflow = await readFile(".github/workflows/update-models-dev.yml", "utf8");

  assert.match(workflow, /cron: "17 3 \* \* \*"/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /npm version patch --no-git-tag-version/);
  assert.match(workflow, /gh workflow run publish\.yml/);
  assert.doesNotMatch(workflow, /npm publish/);
});

test("release workflow reacts to package version changes and creates all release artifacts", async () => {
  const workflow = await readFile(".github/workflows/publish.yml", "utf8");

  assert.match(workflow, /branches:\n\s+- master/);
  assert.match(workflow, /paths:\n\s+- package\.json/);
  assert.match(workflow, /git tag -a "\$TAG"/);
  assert.match(workflow, /npm publish --access public --provenance/);
  assert.match(workflow, /gh release create "\$TAG"/);
  assert.match(workflow, /--generate-notes/);
  assert.match(workflow, /npmjs\.com\/package\/pi-cliproxyapi-provider\/v\/\$\{VERSION\}/);
});
