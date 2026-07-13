import { readFile } from "node:fs/promises";
import type { ModelsDevCatalog, ModelsDevMetadata } from "./types.ts";
import { withNetworkTimeout } from "./network.ts";

export const MODELS_DEV_URL = "https://models.dev/models.json";

function isMetadata(value: unknown): value is ModelsDevMetadata {
  return !!value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string";
}

export function parseModelsDevCatalog(payload: unknown): ModelsDevCatalog {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("models.dev catalog must be a JSON object");
  }

  const record = payload as Record<string, unknown>;
  const catalog: ModelsDevCatalog = {};

  for (const [key, value] of Object.entries(record)) {
    const provider = value as { models?: unknown };
    if (provider && typeof provider === "object" && provider.models && typeof provider.models === "object") {
      for (const [modelId, metadata] of Object.entries(provider.models as Record<string, unknown>)) {
        if (!isMetadata(metadata)) continue;
        const canonicalId = metadata.id.includes("/") ? metadata.id : `${key}/${modelId}`;
        catalog[canonicalId] = { ...metadata, id: canonicalId };
      }
      continue;
    }

    if (isMetadata(value)) {
      catalog[key] = value;
    }
  }

  if (Object.keys(catalog).length === 0 && Object.keys(record).length > 0) {
    throw new Error("models.dev catalog contained no valid models");
  }
  return catalog;
}

export async function fetchModelsDevCatalog(timeoutMs?: number): Promise<ModelsDevCatalog> {
  return withNetworkTimeout(async (signal) => {
    const response = await fetch(MODELS_DEV_URL, { headers: { Accept: "application/json" }, signal });
    if (!response.ok) {
      throw new Error(`models.dev fetch failed: HTTP ${response.status} ${response.statusText}`);
    }
    return parseModelsDevCatalog(await response.json());
  }, timeoutMs, "models.dev fetch");
}

export async function readBundledModelsDevFallback(path: string): Promise<ModelsDevCatalog> {
  return parseModelsDevCatalog(JSON.parse(await readFile(path, "utf8")));
}
