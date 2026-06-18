import test from "node:test";
import assert from "node:assert/strict";
import { buildUnavailableProviderModels, PI_MODEL_DEFAULTS } from "../src/provider.ts";

test("builds a placeholder model so /login can see the dynamic provider", () => {
  assert.deepEqual(buildUnavailableProviderModels("login-required"), [
    {
      id: "login-required",
      name: "login-required",
      ...PI_MODEL_DEFAULTS,
    },
  ]);
});
