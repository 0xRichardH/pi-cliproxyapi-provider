import type { ThinkingLevelMap } from "@earendil-works/pi-ai";
import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";

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
  /**
   * models.dev's description of how a reasoning model is controlled. The
   * `effort` entry lists the provider's accepted effort names, which is the
   * only per-model source for pi's extended `xhigh`/`max` levels: CLIProxyAPI's
   * `/v1/models` carries no such data.
   */
  reasoning_options?: ModelsDevReasoningOption[];
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

export interface ModelsDevReasoningOption {
  type: string;
  values?: string[];
  min?: number;
  max?: number;
}

export type ModelsDevCatalog = Record<string, ModelsDevMetadata>;

export interface ProviderModelConfigLike {
  id: string;
  name: string;
  reasoning: boolean;
  api?: ProviderModelConfig["api"];
  baseUrl?: string;
  compat?: ProviderModelConfig["compat"];
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
