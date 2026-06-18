import test from "node:test";
import assert from "node:assert/strict";
import { parseModelsDevCatalog } from "../src/models-dev.ts";

test("parses provider-agnostic models.dev catalog", () => {
  const catalog = parseModelsDevCatalog({
    "openai/gpt-5.5": { id: "openai/gpt-5.5", name: "GPT-5.5" },
    broken: { name: "Broken" },
  });

  assert.deepEqual(Object.keys(catalog), ["openai/gpt-5.5"]);
});

test("parses provider-organized models.dev API catalog", () => {
  const catalog = parseModelsDevCatalog({
    openai: {
      id: "openai",
      models: {
        "gpt-5.5": { id: "gpt-5.5", name: "GPT-5.5" }
      }
    }
  });

  assert.equal(catalog["openai/gpt-5.5"].name, "GPT-5.5");
});
