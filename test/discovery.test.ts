import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverModels, modelsDevCachePath } from "../src/discovery.ts";
import { writeCache } from "../src/cache.ts";
import type { CpaProviderConfig } from "../src/types.ts";

function config(): CpaProviderConfig {
  return {
    providerName: `cpa-test-${Date.now()}-${Math.random()}`,
    baseUrl: "http://cliproxyapi.test/v1",
    authRequired: false,
    authHeader: false,
    headers: {},
    cpaCacheTtlSeconds: 3600,
    modelsDevCacheTtlSeconds: 86400,
    modelsDevEnabled: true,
    modelAliases: {},
  };
}

async function withTempHome<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "pi-cpa-discovery-"));
  const originalHome = process.env.HOME;
  process.env.HOME = dir;
  try {
    return await fn(dir);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(dir, { recursive: true, force: true });
  }
}

function stubFetch(): { restore: () => void; modelsDevFetches: () => number } {
  const originalFetch = globalThis.fetch;
  let modelsDevFetches = 0;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const text = String(url);
    if (text === "http://cliproxyapi.test/v1/models") {
      return new Response(JSON.stringify({ data: [{ id: "gpt-5.5", owned_by: "openai" }] }), { status: 200 });
    }
    if (text === "https://models.dev/models.json") {
      modelsDevFetches += 1;
      return new Response(JSON.stringify({ openai: { models: { "gpt-5.5": { id: "gpt-5.5", name: "Network GPT" } } } }), { status: 200 });
    }
    throw new Error(`unexpected network fetch: ${text}`);
  }) as typeof fetch;
  return { restore: () => { globalThis.fetch = originalFetch; }, modelsDevFetches: () => modelsDevFetches };
}

test("startup discovery uses bundled models.dev metadata instead of fetching the network", async () => {
  await withTempHome(async () => {
    const fetchStub = stubFetch();
    const bundledModelsDevPath = join(process.env.HOME!, "models-dev-fallback.json");
    await writeFile(bundledModelsDevPath, JSON.stringify({ openai: { models: { "gpt-5.5": { id: "gpt-5.5", name: "Bundled GPT" } } } }));

    try {
      const result = await discoverModels({ config: config(), bundledModelsDevPath });

      assert.equal(result.sources.modelsDev, "bundled");
      assert.equal(result.modelsDevCatalog["openai/gpt-5.5"].name, "Bundled GPT");
      assert.equal(fetchStub.modelsDevFetches(), 0);
    } finally {
      fetchStub.restore();
    }
  });
});

test("startup discovery uses a fresh models.dev cache before bundled metadata", async () => {
  await withTempHome(async () => {
    const fetchStub = stubFetch();
    const bundledModelsDevPath = join(process.env.HOME!, "models-dev-fallback.json");
    await writeFile(bundledModelsDevPath, JSON.stringify({ openai: { models: { "gpt-5.5": { id: "gpt-5.5", name: "Bundled GPT" } } } }));
    await writeCache(modelsDevCachePath(), { "openai/gpt-5.5": { id: "openai/gpt-5.5", name: "Cached GPT" } }, Date.now());

    try {
      const result = await discoverModels({ config: config(), bundledModelsDevPath });

      assert.equal(result.sources.modelsDev, "cache");
      assert.equal(result.modelsDevCatalog["openai/gpt-5.5"].name, "Cached GPT");
      assert.equal(fetchStub.modelsDevFetches(), 0);
    } finally {
      fetchStub.restore();
    }
  });
});

test("forced discovery refreshes models.dev from the network", async () => {
  await withTempHome(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const text = String(url);
      if (text === "http://cliproxyapi.test/v1/models") {
        return new Response(JSON.stringify({ data: [{ id: "gpt-5.5", owned_by: "openai" }] }), { status: 200 });
      }
      if (text === "https://models.dev/models.json") {
        return new Response(JSON.stringify({ openai: { models: { "gpt-5.5": { id: "gpt-5.5", name: "Fresh GPT" } } } }), { status: 200 });
      }
      throw new Error(`unexpected network fetch: ${text}`);
    }) as typeof fetch;
    const bundledModelsDevPath = join(process.env.HOME!, "models-dev-fallback.json");
    await writeFile(bundledModelsDevPath, JSON.stringify({ openai: { models: { "gpt-5.5": { id: "gpt-5.5", name: "Bundled GPT" } } } }));

    try {
      const result = await discoverModels({ config: config(), bundledModelsDevPath, force: true });

      assert.equal(result.sources.modelsDev, "fresh");
      assert.equal(result.modelsDevCatalog["openai/gpt-5.5"].name, "Fresh GPT");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
