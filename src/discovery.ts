import { join } from "node:path";
import { cacheDir, providerCacheKey } from "./config.ts";
import type { CpaProviderConfig } from "./types.ts";

export function cpaModelsCachePath(config: CpaProviderConfig): string {
  return join(cacheDir(), providerCacheKey(config), "cpa-models.json");
}

export function modelsDevCachePath(): string {
  return join(cacheDir(), "models-dev.json");
}

export function discoveryHeaders(config: CpaProviderConfig, apiKey?: string): Record<string, string> {
  return {
    ...config.headers,
    ...(config.authHeader && apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}
