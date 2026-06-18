import test from "node:test";
import assert from "node:assert/strict";
import { mergeConfigLayers, DEFAULT_CONFIG } from "../src/config.ts";

test("merges defaults, global config, project config, and environment overrides", () => {
  const config = mergeConfigLayers(
    { baseUrl: "http://global.example/v1", providerName: "global", modelAliases: { a: "openai/a" } },
    { providerName: "project", modelAliases: { b: "openai/b" }, authRequired: false },
    {
      CLIPROXYAPI_BASE_URL: "http://env.example/v1",
      CLIPROXYAPI_PROVIDER_NAME: "env-provider",
      CLIPROXYAPI_AUTH_HEADER: "false"
    }
  );

  assert.equal(config.baseUrl, "http://env.example/v1");
  assert.equal(config.providerName, "env-provider");
  assert.equal(config.authRequired, false);
  assert.equal(config.authHeader, false);
  assert.deepEqual(config.modelAliases, { a: "openai/a", b: "openai/b" });
});

test("uses safe default config", () => {
  const config = mergeConfigLayers(undefined, undefined, {});

  assert.equal(config.providerName, "cpa");
  assert.equal(config.baseUrl, DEFAULT_CONFIG.baseUrl);
  assert.equal(config.authRequired, true);
  assert.equal(config.authHeader, true);
  assert.equal(config.cpaCacheTtlSeconds, 3600);
  assert.equal(config.modelsDevCacheTtlSeconds, 86400);
});
