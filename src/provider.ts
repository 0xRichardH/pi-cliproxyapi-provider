import type { CpaModel } from "./cpa.ts";
import { findMetadataMatch, type MetadataMatchMethod } from "./matching.ts";
import type { InputModality, ModelsDevCatalog, ModelsDevMetadata, ProviderModelConfigLike } from "./types.ts";

export const PI_MODEL_DEFAULTS = {
  reasoning: false,
  input: ["text"] as InputModality[],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 16384,
};

export interface BuildProviderModelsStats {
  total: number;
  enriched: number;
  unmatched: number;
  matchMethods: Record<MetadataMatchMethod, number>;
  unmatchedModelIds: string[];
}

export interface BuildProviderModelsResult {
  models: ProviderModelConfigLike[];
  stats: BuildProviderModelsStats;
}

function inputFromMetadata(metadata: ModelsDevMetadata): InputModality[] {
  const input = metadata.modalities?.input ?? [];
  return input.includes("image") ? ["text", "image"] : ["text"];
}

function costFromMetadata(metadata: ModelsDevMetadata): ProviderModelConfigLike["cost"] {
  return {
    input: metadata.cost?.input ?? 0,
    output: metadata.cost?.output ?? 0,
    cacheRead: metadata.cost?.cache_read ?? 0,
    cacheWrite: metadata.cost?.cache_write ?? 0,
  };
}

function modelFromMetadata(cpaModel: CpaModel, metadata: ModelsDevMetadata): ProviderModelConfigLike {
  return {
    id: cpaModel.id,
    name: metadata.name ?? cpaModel.id,
    reasoning: metadata.reasoning ?? PI_MODEL_DEFAULTS.reasoning,
    input: inputFromMetadata(metadata),
    cost: costFromMetadata(metadata),
    contextWindow: metadata.limit?.context ?? PI_MODEL_DEFAULTS.contextWindow,
    maxTokens: metadata.limit?.output ?? PI_MODEL_DEFAULTS.maxTokens,
  };
}

function defaultModel(cpaModel: CpaModel): ProviderModelConfigLike {
  return {
    id: cpaModel.id,
    name: cpaModel.id,
    ...PI_MODEL_DEFAULTS,
  };
}

function emptyMatchMethods(): Record<MetadataMatchMethod, number> {
  return {
    alias: 0,
    exact: 0,
    "owner-prefix": 0,
    suffix: 0,
    "normalized-suffix": 0,
  };
}

export function buildUnavailableProviderModels(id = "login-required"): ProviderModelConfigLike[] {
  return [{ id, name: id, ...PI_MODEL_DEFAULTS }];
}

export function buildProviderModels(
  cpaModels: CpaModel[],
  catalog: ModelsDevCatalog,
  aliases: Record<string, string>,
): BuildProviderModelsResult {
  const matchMethods = emptyMatchMethods();
  const unmatchedModelIds: string[] = [];
  let enriched = 0;

  const models = cpaModels.map((cpaModel) => {
    const match = findMetadataMatch(cpaModel, catalog, aliases);
    if (!match) {
      unmatchedModelIds.push(cpaModel.id);
      return defaultModel(cpaModel);
    }

    enriched += 1;
    matchMethods[match.method] += 1;
    return modelFromMetadata(cpaModel, match.metadata);
  });

  return {
    models,
    stats: {
      total: cpaModels.length,
      enriched,
      unmatched: unmatchedModelIds.length,
      matchMethods,
      unmatchedModelIds,
    },
  };
}
