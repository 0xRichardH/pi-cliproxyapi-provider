import test from "node:test";
import assert from "node:assert/strict";
import { fetchModelsDevCatalog, parseModelsDevCatalog } from "../src/models-dev.ts";

test("parses provider-agnostic models.dev catalog", () => {
  const catalog = parseModelsDevCatalog({
    "openai/gpt-5.5": { id: "openai/gpt-5.5", name: "GPT-5.5" },
    broken: { name: "Broken" },
  });

  assert.deepEqual(Object.keys(catalog), ["openai/gpt-5.5"]);
  assert.equal(catalog["openai/gpt-5.5"].sourceProvider, "openai");
});

test("parses provider-organized models.dev API catalog", () => {
  const catalog = parseModelsDevCatalog({
    openai: {
      id: "openai",
      models: {
        "gpt-5.5": {
          id: "gpt-5.5",
          name: "GPT-5.5",
          cost: { input: 5, output: 30, cache_read: 0.5, cache_write: 6.25 },
        }
      }
    }
  });

  assert.equal(catalog["openai/gpt-5.5"].name, "GPT-5.5");
  assert.equal(catalog["openai/gpt-5.5"].sourceProvider, "openai");
  assert.equal(catalog["openai/gpt-5.5"].cost?.output, 30);
});

test("preserves provider-qualified entries when providers share canonical model IDs", () => {
  const catalog = parseModelsDevCatalog({
    openrouter: { models: { "minimax/minimax-m3": { id: "minimax/minimax-m3" } } },
    other: { models: { "minimax/minimax-m3": { id: "minimax/minimax-m3" } } },
  });

  assert.equal(catalog["openrouter/minimax/minimax-m3"].sourceProvider, "openrouter");
  assert.equal(catalog["openrouter/minimax/minimax-m3"].id, "minimax/minimax-m3");
  assert.equal(catalog["other/minimax/minimax-m3"].sourceProvider, "other");
});

test("aborts models.dev catalog fetch instead of waiting forever on a stuck network fetch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => fetchModelsDevCatalog(1),
      /timed out after 1ms/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("aborts models.dev catalog fetch when response body parsing stalls", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    json: () => new Promise(() => {}),
  })) as typeof fetch;

  try {
    const result = await Promise.race([
      fetchModelsDevCatalog(1).catch((error: Error) => error.message),
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 25)),
    ]);

    assert.match(result, /timed out after 1ms/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
