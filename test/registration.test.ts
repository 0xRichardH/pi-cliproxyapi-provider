import test from "node:test";
import assert from "node:assert/strict";
import { anthropicBaseUrl, buildProviderRegistration } from "../src/registration.ts";
import type { ProviderModelConfigLike } from "../src/types.ts";

test("uses environment API key placeholder when auth is required", () => {
  const registration = buildProviderRegistration({
    providerName: "cpa",
    baseUrl: "http://localhost:8317/v1",
    authRequired: true,
    authHeader: true,
    headers: { "User-Agent": "pi" },
    modelsDevEnabled: true,
    metadataFallbackProvider: "openrouter",
    modelAliases: {},
    modelOverrides: {},
  }, [{
    id: "openai/gpt-test",
    name: "GPT Test",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
    compat: { supportsDeveloperRole: true, supportsStrictMode: true },
  }]);

  assert.equal(registration.providerName, "cpa");
  assert.equal(registration.config.apiKey, "$CLIPROXYAPI_API_KEY");
  assert.equal(registration.config.authHeader, true);
  assert.deepEqual(registration.config.models?.[0]?.compat, {
    supportsDeveloperRole: true,
    supportsStrictMode: false,
  });
  assert.equal(registration.config.oauth, undefined);
});

test("disables strict mode without changing an explicit Responses API", () => {
  const registration = buildProviderRegistration({
    providerName: "cpa",
    baseUrl: "http://localhost:8317/v1",
    authRequired: false,
    authHeader: false,
    headers: {},
    modelsDevEnabled: true,
    metadataFallbackProvider: "openrouter",
    modelAliases: {},
    modelOverrides: {},
  }, [{
    id: "openai/gpt-responses-test",
    name: "GPT Responses Test",
    reasoning: true,
    api: "openai-responses",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
    compat: { supportsStrictMode: true },
  }]);

  assert.deepEqual(registration.config.models?.[0]?.compat, {
    supportsStrictMode: false,
  });
  assert.equal(registration.config.models?.[0]?.api, "openai-responses");
});

function registrationForModels(models: ProviderModelConfigLike[]) {
  return buildProviderRegistration({
    providerName: "cpa",
    baseUrl: "http://localhost:8317/v1",
    authRequired: false,
    authHeader: false,
    headers: {},
    modelsDevEnabled: true,
    metadataFallbackProvider: "openrouter",
    modelAliases: {},
    modelOverrides: {},
  }, models);
}

function claudeModel(id: string, compat?: ProviderModelConfigLike["compat"]): ProviderModelConfigLike {
  return {
    id,
    name: id,
    reasoning: true,
    api: "anthropic-messages",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 64000,
    ...(compat ? { compat } : {}),
  };
}

test("adds the Anthropic adaptive thinking compat flag to Claude models only", () => {
  const registration = registrationForModels([
    claudeModel("claude-opus-5"),
    claudeModel("0xdev/claude-sonnet-4-6"),
    { ...claudeModel("gemini-3-pro"), api: undefined },
    { ...claudeModel("not-claude-opus"), api: undefined },
  ]);

  const models = registration.config.models ?? [];
  assert.deepEqual(models[0]?.compat, {
    supportsStrictMode: false,
    forceAdaptiveThinking: true,
  });
  assert.deepEqual(models[1]?.compat, {
    supportsStrictMode: false,
    forceAdaptiveThinking: true,
  });
  assert.deepEqual(models[2]?.compat, { supportsStrictMode: false });
  assert.deepEqual(models[3]?.compat, { supportsStrictMode: false });
  assert.equal(models[0]?.api, "anthropic-messages");
  // CLIProxyAPI rejects the per-message output_config this flag would produce.
  assert.equal((models[0]?.compat as Record<string, unknown>).supportsMidConvoEffort, undefined);
});

test("gives Claude models a base URL without the OpenAI-compatible /v1 suffix", () => {
  const registration = registrationForModels([
    claudeModel("claude-opus-5"),
    { ...claudeModel("gemini-3-pro"), api: undefined },
  ]);

  // Pi's Anthropic driver appends /v1/messages itself; reusing the provider
  // base URL verbatim would request /v1/v1/messages.
  assert.equal(registration.config.models?.[0]?.baseUrl, "http://localhost:8317");
  assert.equal(registration.config.models?.[1]?.baseUrl, undefined);
  assert.equal(registration.config.baseUrl, "http://localhost:8317/v1");
});

test("strips exactly one trailing /v1 when deriving the Anthropic base URL", () => {
  assert.equal(anthropicBaseUrl("http://localhost:8317/v1"), "http://localhost:8317");
  assert.equal(anthropicBaseUrl("http://localhost:8317/v1/"), "http://localhost:8317");
  assert.equal(anthropicBaseUrl("https://cpa.example.com/proxy/v1"), "https://cpa.example.com/proxy");
  assert.equal(anthropicBaseUrl("https://cpa.example.com/v1/v1"), "https://cpa.example.com/v1");
  assert.equal(anthropicBaseUrl("https://cpa.example.com"), "https://cpa.example.com");
});

test("preserves a pre-existing per-model compat value on Claude models", () => {
  const registration = registrationForModels([
    claudeModel("claude-opus-4-6", { supportsLongCacheRetention: true, supportsStrictMode: true }),
  ]);

  assert.deepEqual(registration.config.models?.[0]?.compat, {
    supportsLongCacheRetention: true,
    supportsStrictMode: false,
    forceAdaptiveThinking: true,
  });
});

test("uses nonempty placeholder API key for no-auth mode", () => {
  const registration = buildProviderRegistration({
    providerName: "cpa",
    baseUrl: "http://localhost:8317/v1",
    authRequired: false,
    authHeader: false,
    headers: {},
    modelsDevEnabled: true,
    metadataFallbackProvider: "openrouter",
    modelAliases: {},
    modelOverrides: {},
  }, []);

  assert.equal(registration.config.apiKey, "cliproxyapi-no-auth");
  assert.equal(registration.config.authHeader, false);
});

test("forces Authorization header off when auth is disabled", () => {
  const registration = buildProviderRegistration({
    providerName: "cpa",
    baseUrl: "http://localhost:8317/v1",
    authRequired: false,
    authHeader: true,
    headers: {},
    modelsDevEnabled: true,
    metadataFallbackProvider: "openrouter",
    modelAliases: {},
    modelOverrides: {},
  }, []);

  assert.equal(registration.config.apiKey, "cliproxyapi-no-auth");
  assert.equal(registration.config.authHeader, false);
});
