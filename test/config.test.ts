import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeConfigLayers,
  DEFAULT_CONFIG,
  projectConfigPath,
  readConfigFile,
  readProjectConfigFile,
  saveModelOverride,
} from "../src/config.ts";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("merges defaults, global config, project config, and environment overrides", () => {
  const config = mergeConfigLayers(
    {
      baseUrl: "http://global.example/v1",
      providerName: "global",
      modelAliases: { a: "openai/a" },
      modelOverrides: { a: { reasoning: false, contextWindow: 128000 } },
    },
    {
      providerName: "project",
      modelAliases: { b: "openai/b" },
      modelOverrides: { a: { contextWindow: 272000 }, b: { maxTokens: 32768 } },
      authRequired: false,
    },
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
  assert.deepEqual(config.modelOverrides, {
    a: { reasoning: false, contextWindow: 272000 },
    b: { maxTokens: 32768 },
  });
});

test("uses safe default config", () => {
  const config = mergeConfigLayers(undefined, undefined, {});

  assert.equal(config.providerName, "cpa");
  assert.equal(config.baseUrl, DEFAULT_CONFIG.baseUrl);
  assert.equal(config.authRequired, true);
  assert.equal(config.authHeader, true);
  assert.equal(config.metadataFallbackProvider, "openrouter");
  assert.deepEqual(config.modelOverrides, {});
});

test("allows metadata fallback provider overrides and disabling", () => {
  assert.equal(
    mergeConfigLayers({ metadataFallbackProvider: "other" }, undefined, {}).metadataFallbackProvider,
    "other",
  );
  assert.equal(
    mergeConfigLayers({ metadataFallbackProvider: null }, undefined, {}).metadataFallbackProvider,
    null,
  );
  assert.equal(
    mergeConfigLayers(undefined, undefined, { CLIPROXYAPI_METADATA_FALLBACK_PROVIDER: "none" }).metadataFallbackProvider,
    null,
  );
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
      modelOverrides: { local: { reasoning: true, maxTokens: 8192 } },
    },
    {}
  );

  assert.equal(config.baseUrl, "http://trusted.example/v1");
  assert.equal(config.providerName, "global");
  assert.equal(config.authRequired, true);
  assert.equal(config.authHeader, true);
  assert.deepEqual(config.headers, { "X-Global": "yes" });
  assert.deepEqual(config.modelAliases, { local: "openai/local" });
  assert.deepEqual(config.modelOverrides, { local: { reasoning: true, maxTokens: 8192 } });
});

test("project config reader ignores unsupported malformed fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-cpa-project-config-"));
  const path = join(dir, "config.json");

  try {
    await writeFile(path, JSON.stringify({
      baseUrl: 123,
      headers: null,
      modelAliases: { local: "openai/local" },
      modelOverrides: { local: { contextWindow: 272000 } },
    }));

    const config = mergeConfigLayers(undefined, readProjectConfigFile(path), {});

    assert.deepEqual(config.modelAliases, { local: "openai/local" });
    assert.deepEqual(config.modelOverrides, { local: { contextWindow: 272000 } });
    assert.equal(config.baseUrl, DEFAULT_CONFIG.baseUrl);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("rejects unsafe or malformed model overrides", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-cpa-config-overrides-invalid-"));
  const path = join(dir, "config.json");

  try {
    for (const modelOverrides of [
      { model: { api: "openai-completions" } },
      { model: { contextWindow: 0 } },
      { model: { contextWindow: 999999999999 } },
      { model: { maxTokens: 1 } },
      { model: { reasoning: "yes" } },
    ]) {
      await writeFile(path, JSON.stringify({ modelOverrides }));
      assert.throws(() => readConfigFile(path), /modelOverrides\.model/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("project null overrides restore catalog defaults instead of inherited globals", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-cpa-project-tombstones-"));
  const path = join(dir, "config.json");
  try {
    await writeFile(path, JSON.stringify({
      modelOverrides: { model: { reasoning: null, contextWindow: null, maxTokens: 65536 } },
    }));
    const config = mergeConfigLayers(
      { modelOverrides: { model: { reasoning: true, contextWindow: 272000, maxTokens: 32768 } } },
      readProjectConfigFile(path),
      {},
    );

    assert.deepEqual(config.modelOverrides, { model: { maxTokens: 65536 } });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("model override saves target the project layer and preserve global provenance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-cpa-save-override-"));
  try {
    const path = projectConfigPath(cwd);
    await mkdir(join(cwd, ".pi", "pi-cliproxyapi-provider"), { recursive: true });
    saveModelOverride(cwd, "model", { contextWindow: null, maxTokens: 65536 });

    assert.equal(path, projectConfigPath(cwd));
    assert.deepEqual(readProjectConfigFile(path)?.modelOverrides, {
      model: { contextWindow: null, maxTokens: 65536 },
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
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

    await writeFile(path, JSON.stringify({ metadataFallbackProvider: "" }));
    assert.throws(
      () => readConfigFile(path),
      /metadataFallbackProvider must be a non-empty string or null/
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
