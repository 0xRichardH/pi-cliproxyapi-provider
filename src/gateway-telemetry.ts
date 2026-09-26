function readPositiveNumber(raw: string | null): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export function tokensPerSecondFromHeaders(headers: Headers): number | undefined {
  return readPositiveNumber(
    headers.get("x-cliproxyapi-tokens-per-second") ??
      headers.get("x-cliproxy-tokens-per-second") ??
      headers.get("x-omniroute-tokens-per-second"),
  );
}

export function captureGatewayTokensPerSecond(response: Response): number | undefined {
  return tokensPerSecondFromHeaders(response.headers);
}

export function wrapFetchCaptureTokensPerSecond(
  fetchImpl: typeof fetch,
  onCapture: (tps: number) => void,
): typeof fetch {
  return async (input, init) => {
    const response = await fetchImpl(input, init);
    const tps = captureGatewayTokensPerSecond(response);
    if (tps !== undefined) onCapture(tps);
    return response;
  };
}

export function formatGatewayTokensPerSecond(tps: number | undefined): string {
  return tps === undefined ? "--" : tps.toFixed(1);
}

export function registerGatewayTelemetry(pi: {
  on(event: string, handler: (...args: never[]) => unknown): void;
}): void {
  let captured: number | undefined;
  let restoreFetch: (() => void) | undefined;
  const install = () => {
    if (restoreFetch) return;
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = wrapFetchCaptureTokensPerSecond(originalFetch, (tps) => {
      captured = tps;
    });
    restoreFetch = () => {
      globalThis.fetch = originalFetch;
    };
  };
  pi.on("session_start", (() => {
    captured = undefined;
    install();
  }) as (...args: never[]) => unknown);
  pi.on("agent_settled", ((_event: unknown, ctx: { ui?: { notify?: (message: string, type?: string) => void } }) => {
    ctx.ui?.notify?.(`TPS ${formatGatewayTokensPerSecond(captured)} tok/s`, "info");
    captured = undefined;
  }) as (...args: never[]) => unknown);
  pi.on("session_shutdown", (() => {
    restoreFetch?.();
    restoreFetch = undefined;
    captured = undefined;
  }) as (...args: never[]) => unknown);
}
