import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProviderCatalog } from "../src/catalog.ts";
import { cpaModelsCachePath } from "../src/discovery.ts";
import { writeCache } from "../src/cache.ts";
import type { CpaProviderConfig } from "../src/types.ts";

const config: CpaProviderConfig = {
  providerName: "cpa-catalog-test",
  baseUrl: "http://cliproxyapi.test/v1",
  authRequired: false,
  authHeader: false,
  headers: {},
  modelsDevEnabled: true,
  modelAliases: {},
};

async function withTempHome<T>(fn: (home: string, fallback: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-catalog-"));
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  const fallback = join(home, "models-dev-fallback.json");
  await writeFile(fallback, JSON.stringify({ openai: { models: { fresh: { id: "fresh", name: "Fresh", reasoning: true } } } }));
  try {
    return await fn(home, fallback);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
}

function catalog(fallback: string): ProviderCatalog {
  return new ProviderCatalog({ config, bundledModelsDevPath: fallback, getApiKey: async () => undefined, backgroundTimeoutMs: 50 });
}

test("catalog load is cache-first and performs no network request", async () => {
  await withTempHome(async (_home, fallback) => {
    await writeCache(cpaModelsCachePath(config), [{ id: "cached", owned_by: "openai" }], 1234);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("network should not run"); }) as typeof fetch;
    try {
      const snapshot = await catalog(fallback).load();
      assert.deepEqual(snapshot.cpaModels.map((model) => model.id), ["cached"]);
      assert.equal(snapshot.cpaUpdatedAt, 1234);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("background refresh updates CPA models while retaining metadata", async () => {
  await withTempHome(async (_home, fallback) => {
    await writeCache(cpaModelsCachePath(config), [{ id: "cached", owned_by: "openai" }]);
    const instance = catalog(fallback);
    await instance.load();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      assert.equal(String(url), "http://cliproxyapi.test/v1/models");
      return new Response(JSON.stringify({ data: [{ id: "fresh", owned_by: "openai" }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await instance.refresh("models", "background");
      assert.equal(result.models.updated, true);
      assert.equal(result.models.changed, true);
      assert.deepEqual(result.snapshot.cpaModels.map((model) => model.id), ["fresh"]);
      assert.equal(result.snapshot.built.models[0].reasoning, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("failed background refresh preserves the last-known-good CPA snapshot", async () => {
  await withTempHome(async (_home, fallback) => {
    await writeCache(cpaModelsCachePath(config), [{ id: "cached", owned_by: "openai" }]);
    const instance = catalog(fallback);
    await instance.load();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
    try {
      const result = await instance.refresh("models", "background");
      assert.match(String(result.models.error), /offline/);
      assert.deepEqual(result.snapshot.cpaModels.map((model) => model.id), ["cached"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("refresh deduplicates concurrent requests", async () => {
  await withTempHome(async (_home, fallback) => {
    const instance = catalog(fallback);
    await instance.load();
    const originalFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async () => {
      fetches += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ data: [{ id: "fresh" }] }), { status: 200 });
    }) as typeof fetch;
    try {
      await Promise.all([instance.refresh("models", "background"), instance.refresh("models", "background")]);
      assert.equal(fetches, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
