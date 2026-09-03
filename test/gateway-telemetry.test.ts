import test from "node:test";
import assert from "node:assert/strict";
import { formatGatewayTokensPerSecond, tokensPerSecondFromUsage } from "../src/gateway-telemetry.ts";

test("prefers gateway tokens_per_second", () => {
  assert.equal(tokensPerSecondFromUsage({ tokens_per_second: 80.5 }), 80.5);
  assert.equal(formatGatewayTokensPerSecond([{ tokens_per_second: 40 }]), "40.0");
});

test("does not invent tok/s from output / elapsed", () => {
  assert.equal(tokensPerSecondFromUsage({ output: 200, latency_ms: 2000 }), undefined);
  assert.equal(formatGatewayTokensPerSecond([{ output: 200 }]), "--");
});
