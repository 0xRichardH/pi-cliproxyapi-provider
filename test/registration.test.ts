import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderRegistration } from "../src/registration.ts";

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
