import type { Api, Model, ThinkingLevelMap } from "@earendil-works/pi-ai";

export type InputModality = "text" | "image";

export interface ProviderModelOverride {
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
}

export interface ProviderModelOverrideLayer {
  reasoning?: boolean | null;
  contextWindow?: number | null;
  maxTokens?: number | null;
}

export type ProviderModelOverrides = Record<string, ProviderModelOverride>;
export type ProviderModelOverrideLayers = Record<string, ProviderModelOverrideLayer>;

export interface CpaProviderConfig {
  providerName: string;
  baseUrl: string;
  authRequired: boolean;
  authHeader: boolean;
  headers: Record<string, string>;
  modelsDevEnabled: boolean;
  metadataFallbackProvider: string | null;
  modelAliases: Record<string, string>;
  modelOverrides: ProviderModelOverrides;
}

export interface ModelsDevMetadata {
  id: string;
  /** models.dev provider key retained for owner-hint matching. */
  sourceProvider?: string;
  name?: string;
  reasoning?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  limit?: {
    context?: number;
    output?: number;
  };
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
    tiers?: Array<{
      input?: number;
      output?: number;
      cache_read?: number;
      cache_write?: number;
      tier?: {
        type?: string;
        size?: number;
      };
    }>;
  };
}

export type ModelsDevCatalog = Record<string, ModelsDevMetadata>;

export interface ProviderModelConfigLike {
  id: string;
  name: string;
  reasoning: boolean;
  api?: Api;
  baseUrl?: string;
  compat?: Model<Api>["compat"];
  thinkingLevelMap?: ThinkingLevelMap;
  input: InputModality[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    tiers?: Array<{
      inputTokensAbove: number;
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    }>;
  };
  contextWindow: number;
  maxTokens: number;
}
