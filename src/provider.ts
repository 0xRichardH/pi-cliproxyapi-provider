import type { CpaModel } from "./cpa.ts";
import { findMetadataMatch, type MetadataMatchMethod } from "./matching.ts";
import { getModelApiOverride, isGpt56Model, type ModelApiContext } from "./model-api.ts";
import { getModelCapabilityOverrides } from "./model-capabilities.ts";
import type { Gpt56ContextWindowMode } from "./settings.ts";
import type { InputModality, ModelsDevCatalog, ModelsDevMetadata, ProviderModelConfigLike } from "./types.ts";

export const GPT_5_6_CANONICAL_CONTEXT_WINDOW = 272000;

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
  const tiers = metadata.cost?.tiers?.flatMap((tier) => {
    const threshold = tier.tier?.size;
    if (tier.tier?.type !== "context" || typeof threshold !== "number") return [];
    return [{
      inputTokensAbove: threshold,
      input: tier.input ?? 0,
      output: tier.output ?? 0,
      cacheRead: tier.cache_read ?? 0,
      cacheWrite: tier.cache_write ?? 0,
    }];
  });

  return {
    input: metadata.cost?.input ?? 0,
    output: metadata.cost?.output ?? 0,
    cacheRead: metadata.cost?.cache_read ?? 0,
    cacheWrite: metadata.cost?.cache_write ?? 0,
    ...(tiers && tiers.length > 0 ? { tiers } : {}),
  };
}

function contextWindowForModel(
  context: ModelApiContext,
  metadataContextWindow: number | undefined,
  mode: Gpt56ContextWindowMode,
): number {
  if (!isGpt56Model(context)) return metadataContextWindow ?? PI_MODEL_DEFAULTS.contextWindow;
  if (mode === "full") return metadataContextWindow ?? GPT_5_6_CANONICAL_CONTEXT_WINDOW;
  return GPT_5_6_CANONICAL_CONTEXT_WINDOW;
}

function modelFromMetadata(
  cpaModel: CpaModel,
  metadata: ModelsDevMetadata,
  gpt56ContextWindow: Gpt56ContextWindowMode,
): ProviderModelConfigLike {
  const capabilityContext = {
    availableModelId: cpaModel.id,
    metadataModelId: metadata.id,
  };
  const capabilityOverrides = getModelCapabilityOverrides(capabilityContext);
  const api = getModelApiOverride(capabilityContext);

  return {
    id: cpaModel.id,
    name: metadata.name ?? cpaModel.id,
    reasoning: capabilityOverrides.reasoning ?? metadata.reasoning ?? PI_MODEL_DEFAULTS.reasoning,
    ...(api ? { api } : {}),
    ...(capabilityOverrides.thinkingLevelMap
      ? { thinkingLevelMap: capabilityOverrides.thinkingLevelMap }
      : {}),
    input: inputFromMetadata(metadata),
    cost: costFromMetadata(metadata),
    contextWindow: contextWindowForModel(capabilityContext, metadata.limit?.context, gpt56ContextWindow),
    maxTokens: metadata.limit?.output ?? PI_MODEL_DEFAULTS.maxTokens,
  };
}

function cloneModelDefaults(): typeof PI_MODEL_DEFAULTS {
  return {
    ...PI_MODEL_DEFAULTS,
    input: [...PI_MODEL_DEFAULTS.input],
    cost: { ...PI_MODEL_DEFAULTS.cost },
  };
}

function defaultModel(cpaModel: CpaModel, gpt56ContextWindow: Gpt56ContextWindowMode): ProviderModelConfigLike {
  const modelContext = { availableModelId: cpaModel.id };
  const capabilityOverrides = getModelCapabilityOverrides(modelContext);
  const api = getModelApiOverride(modelContext);

  return {
    id: cpaModel.id,
    name: cpaModel.id,
    ...cloneModelDefaults(),
    ...capabilityOverrides,
    ...(api ? { api } : {}),
    contextWindow: contextWindowForModel(modelContext, undefined, gpt56ContextWindow),
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
  return [{ id, name: id, ...cloneModelDefaults() }];
}

export function buildProviderModels(
  cpaModels: CpaModel[],
  catalog: ModelsDevCatalog,
  aliases: Record<string, string>,
  gpt56ContextWindow: Gpt56ContextWindowMode = "canonical",
): BuildProviderModelsResult {
  const matchMethods = emptyMatchMethods();
  const unmatchedModelIds: string[] = [];
  let enriched = 0;

  const models = cpaModels.map((cpaModel) => {
    const match = findMetadataMatch(cpaModel, catalog, aliases);
    if (!match) {
      unmatchedModelIds.push(cpaModel.id);
      return defaultModel(cpaModel, gpt56ContextWindow);
    }

    enriched += 1;
    matchMethods[match.method] += 1;
    return modelFromMetadata(cpaModel, match.metadata, gpt56ContextWindow);
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
