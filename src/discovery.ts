import { join } from "node:path";
import { cacheDir, providerCacheKey, type CpaProviderConfig } from "./config.ts";
import { fetchCpaModels, type CpaModel } from "./cpa.ts";
import { getCachedOrFetch } from "./cache.ts";
import { fetchModelsDevCatalog, readBundledModelsDevFallback } from "./models-dev.ts";
import type { ModelsDevCatalog } from "./types.ts";

export interface DiscoveryResult {
  cpaModels: CpaModel[];
  modelsDevCatalog: ModelsDevCatalog;
  sources: {
    cpa: "fresh" | "cache" | "stale";
    modelsDev: "fresh" | "cache" | "stale" | "bundled" | "disabled";
  };
  errors: {
    cpa?: unknown;
    modelsDev?: unknown;
  };
}

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

export async function discoverModels(options: {
  config: CpaProviderConfig;
  bundledModelsDevPath: string;
  force?: boolean;
  discoveryApiKey?: string;
}): Promise<DiscoveryResult> {
  const cpa = await getCachedOrFetch({
    path: cpaModelsCachePath(options.config),
    ttlSeconds: options.config.cpaCacheTtlSeconds,
    force: options.force,
    fetchFresh: () => fetchCpaModels(options.config.baseUrl, discoveryHeaders(options.config, options.discoveryApiKey)),
  });

  if (!options.config.modelsDevEnabled) {
    return {
      cpaModels: cpa.data,
      modelsDevCatalog: {},
      sources: { cpa: cpa.source, modelsDev: "disabled" },
      errors: { cpa: cpa.error },
    };
  }

  try {
    const modelsDev = await getCachedOrFetch({
      path: modelsDevCachePath(),
      ttlSeconds: options.config.modelsDevCacheTtlSeconds,
      force: options.force,
      fetchFresh: fetchModelsDevCatalog,
    });
    return {
      cpaModels: cpa.data,
      modelsDevCatalog: modelsDev.data,
      sources: { cpa: cpa.source, modelsDev: modelsDev.source },
      errors: { cpa: cpa.error, modelsDev: modelsDev.error },
    };
  } catch (error) {
    return {
      cpaModels: cpa.data,
      modelsDevCatalog: await readBundledModelsDevFallback(options.bundledModelsDevPath),
      sources: { cpa: cpa.source, modelsDev: "bundled" },
      errors: { cpa: cpa.error, modelsDev: error },
    };
  }
}
