import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRuntime } from "../src/runtime.ts";
import type { CpaProviderConfig } from "../src/types.ts";

const config: CpaProviderConfig = {
  providerName: "cpa",
  baseUrl: "http://localhost:8317/v1",
  authRequired: false,
  authHeader: false,
  headers: {},
  modelsDevEnabled: true,
  modelAliases: {},
};

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
  assert.equal(registrations[1].provider.models[0].id, "fresh");
  assert.equal(registrations[1].provider.models[0].reasoning, true);
});

test("runtime refreshModels invokes catalog refresh with network when allowNetwork is true", async () => {
  const catalog = {
    load: async () => snapshot("cached"),
    refresh: async (_target: string, mode: string, _getApiKey: any, _signal: any) => {
      assert.equal(mode, "background");
      return {
        snapshot: snapshot("network-fresh"),
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

  const cachedModels = await runtime.refreshModels({ allowNetwork: false } as any);
  assert.equal(cachedModels[0].id, "cached");

  const freshModels = await runtime.refreshModels({ allowNetwork: true } as any);
  assert.equal(freshModels[0].id, "network-fresh");
});
