import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ProviderCatalog } from "../src/catalog.ts";
import { cpaModelsCachePath } from "../src/discovery.ts";
import { ProviderRuntime } from "../src/runtime.ts";
import type { CpaProviderConfig } from "../src/types.ts";

const config: CpaProviderConfig = {
  providerName: "cpa",
  baseUrl: "http://localhost:8317/v1",
  authRequired: false,
  authHeader: false,
  headers: {},
  modelsDevEnabled: true,
  metadataFallbackProvider: "openrouter",
  modelAliases: {},
  modelOverrides: {},
};

function refreshContext(overrides: Record<string, unknown> = {}): any {
  return {
    allowNetwork: true,
    signal: new AbortController().signal,
    publish: async () => true,
    ...overrides,
  };
}

function snapshot(id: string, reasoning = false): any {
  const model = { id, name: id, reasoning, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 16384 };
  return {
    cpaModels: id ? [{ id }] : [],
    metadata: {},
    metadataSource: "bundled",
    built: { models: id ? [model] : [], stats: { total: id ? 1 : 0, enriched: 0, unmatched: id ? 1 : 0, matchMethods: {}, unmatchedModelIds: id ? [id] : [] } },
  };
}

test("runtime registers cached models immediately and refreshes without reload", async () => {
  const registrations: any[] = [];
  const catalog = {
    load: async () => snapshot("cached"),
    refresh: async () => ({
      snapshot: snapshot("fresh", true),
      models: { attempted: true, updated: true, changed: true },
      metadata: { attempted: false, updated: false, changed: false },
    }),
  };
  const runtime = new ProviderRuntime({
    pi: { registerProvider: (name: string, provider: any) => registrations.push({ name, provider }) } as any,
    config,
    catalog: catalog as any,
  });

  await runtime.start();
  await runtime.refresh("models", "background");

  assert.equal(registrations.length, 2);
  assert.equal(registrations[0].provider.models[0].id, "cached");
  assert.equal(registrations[0].provider.models[0].compat.supportsStrictMode, false);
  assert.equal(registrations[1].provider.models[0].id, "fresh");
  assert.equal(registrations[1].provider.models[0].reasoning, true);
  assert.equal(registrations[1].provider.models[0].compat.supportsStrictMode, false);
});

test("runtime refreshModels invokes a models-only catalog refresh with network when allowNetwork is true", async () => {
  const catalog = {
    current: () => undefined,
    load: async () => snapshot("cached"),
    refresh: async (target: string, mode: string, _getApiKey: any, signal?: AbortSignal) => {
      assert.equal(target, "models");
      assert.equal(mode, "background");
      if (signal?.aborted) throw signal.reason;
      const refreshed = snapshot("network-fresh");
      refreshed.built.models[0].api = "openai-responses";
      refreshed.built.models[0].compat = { supportsStrictMode: true };
      return {
        snapshot: refreshed,
        models: { attempted: true, updated: true, changed: true },
        metadata: { attempted: false, updated: false, changed: false },
      };
    },
  };
  const runtime = new ProviderRuntime({
    pi: { registerProvider: () => {} } as any,
    config,
    catalog: catalog as any,
  });

  const cachedModels = await runtime.refreshModels(refreshContext({ allowNetwork: false }));
  assert.equal(cachedModels[0].id, "cached");
  assert.equal((cachedModels[0].compat as { supportsStrictMode?: boolean })?.supportsStrictMode, false);

  const freshModels = await runtime.refreshModels(refreshContext());
  assert.equal(freshModels[0].id, "network-fresh");
  assert.equal(freshModels[0].api, "openai-responses");
  assert.equal((freshModels[0].compat as { supportsStrictMode?: boolean })?.supportsStrictMode, false);
});

test("runtime refreshModels lets Pi publish the returned catalog without competing registration", async () => {
  let registrations = 0;
  const catalog = {
    load: async () => snapshot("cached"),
    refresh: async () => ({
      snapshot: snapshot("gpt-5.6-codex", true),
      models: { attempted: true, updated: true, changed: true },
      metadata: { attempted: false, updated: false, changed: false },
    }),
  };
  const runtime = new ProviderRuntime({
    pi: { registerProvider: () => { registrations += 1; } } as any,
    config,
    catalog: catalog as any,
  });

  const models = await runtime.refreshModels({ allowNetwork: true } as any);

  assert.equal(models[0].id, "gpt-5.6-codex");
  assert.equal(registrations, 0);
});

test("runtime refreshModels normalizes the unavailable fallback after an empty network refresh", async () => {
  const catalog = {
    load: async () => snapshot("cached"),
    refresh: async () => ({
      snapshot: snapshot(""),
      models: { attempted: true, updated: true, changed: true },
      metadata: { attempted: false, updated: false, changed: false },
    }),
  };
  const runtime = new ProviderRuntime({
    pi: { registerProvider: () => {} } as any,
    config,
    catalog: catalog as any,
  });

  const models = await runtime.refreshModels(refreshContext());

  assert.equal(models[0].id, "login-required");
  assert.equal((models[0].compat as { supportsStrictMode?: boolean })?.supportsStrictMode, false);
});

test("runtime refreshModels maps context.force to manual mode and passes signal", async () => {
  let receivedMode: string | undefined;
  let receivedSignal: AbortSignal | undefined;

  const catalog = {
    load: async () => snapshot("cached"),
    refresh: async (_target: string, mode: string, _getApiKey: any, signal?: AbortSignal) => {
      receivedMode = mode;
      receivedSignal = signal;
      return {
        snapshot: snapshot("manual-fresh"),
        models: { attempted: true, updated: true, changed: true },
        metadata: { attempted: false, updated: false, changed: false },
      };
    },
  };
  const runtime = new ProviderRuntime({
    pi: { registerProvider: () => {} } as any,
    config,
    catalog: catalog as any,
  });

  const controller = new AbortController();
  const models = await runtime.refreshModels(refreshContext({ force: true, signal: controller.signal }));

  assert.equal(receivedMode, "manual");
  assert.equal(receivedSignal, controller.signal);
  assert.equal(models[0].id, "manual-fresh");
});

test("runtime refreshModels uses Pi's effective API-key credential", async () => {
  let receivedApiKey: string | undefined;
  const catalog = {
    load: async () => snapshot("cached"),
    refresh: async (_target: string, _mode: string, getApiKey: () => Promise<string | undefined>) => {
      receivedApiKey = await getApiKey();
      return {
        snapshot: snapshot("credential-fresh"),
        models: { attempted: true, updated: true, changed: true },
        metadata: { attempted: false, updated: false, changed: false },
      };
    },
  };
  const runtime = new ProviderRuntime({
    pi: { registerProvider: () => {} } as any,
    config,
    catalog: catalog as any,
  });

  await runtime.refreshModels(refreshContext({
    credential: { type: "api_key", key: "runtime-key" },
  }));

  assert.equal(receivedApiKey, "runtime-key");
});

test("runtime refreshModels leaves publication to Pi", async () => {
  const registrations: any[] = [];
  const catalog = {
    load: async () => snapshot("cached"),
    refresh: async () => ({
      snapshot: snapshot("fresh"),
      models: { attempted: true, updated: true, changed: true },
      metadata: { attempted: false, updated: false, changed: false },
    }),
  };
  const runtime = new ProviderRuntime({
    pi: { registerProvider: (...args: any[]) => registrations.push(args) } as any,
    config,
    catalog: catalog as any,
  });

  await runtime.start();
  const models = await runtime.refreshModels(refreshContext());

  assert.equal(models[0].id, "fresh");
  assert.equal(registrations.length, 1);
});

test("runtime offline refreshModels reuses the loaded snapshot instead of re-reading caches", async () => {
  // Pi runs an offline refresh of every provider each time any extension
  // registers a provider, so startup can call this several times in a row.
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-runtime-"));
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const fallback = join(home, "models-dev-fallback.json");
    await writeFile(fallback, JSON.stringify({ openai: { models: { cached: { id: "cached", name: "Cached" } } } }));
    const cachePath = cpaModelsCachePath(config);
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify({ fetchedAt: Date.now(), data: [{ id: "cached", owned_by: "openai" }] }));

    const catalog = new ProviderCatalog({ config, gpt56ContextWindow: "canonical", bundledModelsDevPath: fallback });
    let loads = 0;
    const load = catalog.load.bind(catalog);
    catalog.load = async () => {
      loads += 1;
      return load();
    };
    const runtime = new ProviderRuntime({ pi: { registerProvider: () => {} } as any, config, catalog });

    await runtime.start();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => runtime.refreshModels(refreshContext({ allowNetwork: false }))),
    );

    assert.equal(loads, 1);
    for (const models of results) assert.equal(models[0].id, "cached");
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("runtime offline refreshModels loads caches when no snapshot exists yet", async () => {
  let loads = 0;
  const catalog = {
    current: () => undefined,
    load: async () => {
      loads += 1;
      return snapshot("cached");
    },
  };
  const runtime = new ProviderRuntime({ pi: { registerProvider: () => {} } as any, config, catalog: catalog as any });

  const models = await runtime.refreshModels(refreshContext({ allowNetwork: false }));

  assert.equal(loads, 1);
  assert.equal(models[0].id, "cached");
});
