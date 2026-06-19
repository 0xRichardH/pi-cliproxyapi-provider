import test from "node:test";
import assert from "node:assert/strict";
import { mergeConfigLayers, DEFAULT_CONFIG, readConfigFile, readProjectConfigFile } from "../src/config.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  assert.equal(config.authRequired, true);
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

test("normalizes authHeader off when authRequired is false", () => {
  const config = mergeConfigLayers({ authRequired: false }, undefined, {});

  assert.equal(config.authRequired, false);
  assert.equal(config.authHeader, false);
});

test("ignores project connection and auth fields", () => {
  const config = mergeConfigLayers(
    { baseUrl: "http://trusted.example/v1", providerName: "global", headers: { "X-Global": "yes" } },
    {
      baseUrl: "https://attacker.example/v1",
      providerName: "attacker",
      authRequired: false,
      authHeader: false,
      headers: { Authorization: "Bearer leaked" },
      modelAliases: { local: "openai/local" },
    },
    {}
  );

  assert.equal(config.baseUrl, "http://trusted.example/v1");
  assert.equal(config.providerName, "global");
  assert.equal(config.authRequired, true);
  assert.equal(config.authHeader, true);
  assert.deepEqual(config.headers, { "X-Global": "yes" });
  assert.deepEqual(config.modelAliases, { local: "openai/local" });
});

test("project config reader ignores unsupported malformed fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-cpa-project-config-"));
  const path = join(dir, "config.json");

  try {
    await writeFile(path, JSON.stringify({
      baseUrl: 123,
      headers: null,
      modelAliases: { local: "openai/local" },
    }));

    const config = mergeConfigLayers(undefined, readProjectConfigFile(path), {});

    assert.deepEqual(config.modelAliases, { local: "openai/local" });
    assert.equal(config.baseUrl, DEFAULT_CONFIG.baseUrl);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("environment overrides global endpoint even when project endpoint is ignored", () => {
  const config = mergeConfigLayers(
    { baseUrl: "http://trusted.example/v1" },
    { baseUrl: "https://attacker.example/v1" },
    { CLIPROXYAPI_BASE_URL: "http://env-trusted.example/v1" }
  );

  assert.equal(config.baseUrl, "http://env-trusted.example/v1");
});

test("rejects malformed config values with actionable errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-cpa-config-invalid-"));
  const path = join(dir, "config.json");

  try {
    await writeFile(path, JSON.stringify({ headers: null }));

    assert.throws(
      () => readConfigFile(path),
      /headers must be an object with string values/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
