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
    modelAliases: {},
  }, []);

  assert.equal(registration.providerName, "cpa");
  assert.equal(registration.config.apiKey, "$CLIPROXYAPI_API_KEY");
  assert.equal(registration.config.authHeader, true);
  assert.equal(registration.config.oauth, undefined);
});

test("uses nonempty placeholder API key for no-auth mode", () => {
  const registration = buildProviderRegistration({
    providerName: "cpa",
    baseUrl: "http://localhost:8317/v1",
    authRequired: false,
    authHeader: false,
    headers: {},
    modelsDevEnabled: true,
    modelAliases: {},
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
    modelAliases: {},
  }, []);

  assert.equal(registration.config.apiKey, "cliproxyapi-no-auth");
  assert.equal(registration.config.authHeader, false);
});
