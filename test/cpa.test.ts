import test from "node:test";
import assert from "node:assert/strict";
import { parseCpaModelsResponse, modelsEndpoint } from "../src/cpa.ts";

test("builds the OpenAI-compatible models endpoint from a /v1 base URL", () => {
  assert.equal(modelsEndpoint("http://localhost:8317/v1"), "http://localhost:8317/v1/models");
  assert.equal(modelsEndpoint("http://localhost:8317/v1/"), "http://localhost:8317/v1/models");
});

test("parses /v1/models responses and keeps only model entries with IDs", () => {
  const models = parseCpaModelsResponse({
    object: "list",
    data: [
      { id: "gpt-5.5", object: "model", owned_by: "openai", created: 1 },
      { object: "model", owned_by: "broken" },
      { id: "claude-sonnet-4-6", object: "model", owned_by: "antigravity" }
    ]
  });

  assert.deepEqual(models.map((model) => model.id), ["gpt-5.5", "claude-sonnet-4-6"]);
  assert.equal(models[0].owned_by, "openai");
});
