import test from "node:test";
import assert from "node:assert/strict";
import {
  captureGatewayTokensPerSecond,
  formatGatewayTokensPerSecond,
  tokensPerSecondFromHeaders,
  wrapFetchCaptureTokensPerSecond,
} from "../src/gateway-telemetry.ts";

test("wrapFetchCaptureTokensPerSecond reads X-CLIProxyAPI-Tokens-Per-Second from Response headers", async () => {
  const inner: typeof fetch = async () =>
    new Response("{}", { headers: { "X-CLIProxyAPI-Tokens-Per-Second": "80.5" } });
  let captured: number | undefined;
  const wrapped = wrapFetchCaptureTokensPerSecond(inner, (tps) => {
    captured = tps;
  });
  const response = await wrapped("https://gateway.example/v1/chat/completions");
  assert.equal(captureGatewayTokensPerSecond(response), 80.5);
  assert.equal(captured, 80.5);
  assert.equal(formatGatewayTokensPerSecond(captured), "80.5");
});

test("does not invent tok/s from latency headers", async () => {
  const inner: typeof fetch = async () =>
    new Response("{}", {
      headers: { "X-OmniRoute-Latency-Ms": "2000", "X-OmniRoute-Tokens-Out": "200" },
    });
  let captured: number | undefined;
  const wrapped = wrapFetchCaptureTokensPerSecond(inner, (tps) => {
    captured = tps;
  });
  await wrapped("https://gateway.example/v1/chat/completions");
  assert.equal(captured, undefined);
  assert.equal(
    tokensPerSecondFromHeaders(new Headers({ "X-OmniRoute-Latency-Ms": "2000", "X-OmniRoute-Tokens-Out": "200" })),
    undefined,
  );
  assert.equal(formatGatewayTokensPerSecond(undefined), "--");
});

test("registerGatewayTelemetry notifies tok/s captured from Response headers", async () => {
  const originalFetch = globalThis.fetch;
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const { registerGatewayTelemetry } = await import("../src/gateway-telemetry.ts");
  registerGatewayTelemetry({
    on(event: string, handler: (...args: unknown[]) => void) {
      handlers[event] = handler;
    },
  } as never);

  globalThis.fetch = (async () =>
    new Response("{}", { headers: { "X-CLIProxyAPI-Tokens-Per-Second": "80.5" } })) as typeof fetch;

  try {
    handlers.session_start?.();
    await globalThis.fetch("https://gateway.example/v1/chat/completions");
    let notified: string | undefined;
    handlers.agent_settled?.({}, {
      ui: {
        notify: (message: string) => {
          notified = message;
        },
      },
    });
    assert.equal(notified, "TPS 80.5 tok/s");
  } finally {
    handlers.session_shutdown?.();
    globalThis.fetch = originalFetch;
  }
});
