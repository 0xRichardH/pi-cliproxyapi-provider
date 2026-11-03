import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, mergeConfigLayers, readConfigFile, readProjectConfigFile } from "../src/config.ts";
import { buildProviderRegistration } from "../src/registration.ts";
import { ProviderCatalog } from "../src/catalog.ts";
import { cpaModelsCachePath } from "../src/discovery.ts";
import { writeCache } from "../src/cache.ts";

test("global credential expressions are validated, forwarded unchanged, and project auth is ignored", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cpa-auth-config-"));
  const path = join(dir, "config.json");
  try {
    for (const apiKey of ["", "   ", null, 42]) {
      await writeFile(path, JSON.stringify({ apiKey }));
      assert.throws(() => readConfigFile(path), /apiKey must be a non-empty string/);
    }
    const expression = "!printf synthetic-key";
    await writeFile(path, JSON.stringify({ apiKey: expression }));
    const global = readConfigFile(path);
    await writeFile(path, JSON.stringify({ apiKey: "!untrusted", baseUrl: "https://untrusted" }));
    const config = mergeConfigLayers(global, readProjectConfigFile(path), {});
    assert.equal(config.apiKey, expression);
    assert.equal(config.baseUrl, DEFAULT_CONFIG.baseUrl);
    assert.equal(buildProviderRegistration(config, []).config.apiKey, expression);
    assert.equal(buildProviderRegistration(DEFAULT_CONFIG, []).config.apiKey, "$CLIPROXYAPI_API_KEY");
    assert.equal(buildProviderRegistration({ ...config, authRequired: false }, []).config.apiKey, "cliproxyapi-no-auth");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("authenticated discovery requires resolved credentials and preserves cache on failure", async () => {
  const home = await mkdtemp(join(tmpdir(), "cpa-auth-discovery-"));
  const oldHome = process.env.HOME;
  const oldFetch = globalThis.fetch;
  process.env.HOME = home;
  const config = { ...DEFAULT_CONFIG, providerName: "auth-test", modelsDevEnabled: false, headers: { "X-Route": "test" } };
  try {
    await writeCache(cpaModelsCachePath(config), [{ id: "cached" }]);
    const catalog = new ProviderCatalog({ config, gpt56ContextWindow: "canonical", bundledModelsDevPath: "unused" });
    await catalog.load();
    let fetches = 0;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      fetches++;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer resolved-key");
      assert.equal(headers.get("x-route"), "test");
      return new Response(JSON.stringify({ data: [{ id: "fresh" }] }), { status: 200 });
    }) as typeof fetch;
    for (const callback of [undefined, async () => undefined, async () => { throw new Error("resolution failed"); }]) {
      const result = await catalog.refresh("models", "manual", callback);
      assert.ok(result.models.error);
      assert.deepEqual(result.snapshot.cpaModels.map((model) => model.id), ["cached"]);
      assert.equal(fetches, 0);
    }
    const result = await catalog.refresh("models", "manual", async () => "resolved-key");
    assert.equal(result.models.updated, true);
    assert.equal(fetches, 1);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
    await rm(home, { recursive: true, force: true });
  }
});
