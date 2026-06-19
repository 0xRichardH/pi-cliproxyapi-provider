import test from "node:test";
import assert from "node:assert/strict";
import { parseCpaModelsResponse, modelsEndpoint, fetchCpaModels } from "../src/cpa.ts";

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

test("aborts CPA model discovery instead of waiting forever on a stuck network fetch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchCpaModels("http://localhost:8317/v1", {}, 1),
      /timed out after 1ms/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("aborts CPA model discovery when response body parsing stalls", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    json: () => new Promise(() => {}),
  })) as typeof fetch;

  try {
    const result = await Promise.race([
      fetchCpaModels("http://localhost:8317/v1", {}, 1).catch((error: Error) => error.message),
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 25)),
    ]);

    assert.match(result, /timed out after 1ms/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
