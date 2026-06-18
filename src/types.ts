export type InputModality = "text" | "image";

export interface CpaProviderConfig {
  providerName: string;
  baseUrl: string;
  authRequired: boolean;
  authHeader: boolean;
  headers: Record<string, string>;
  cpaCacheTtlSeconds: number;
  modelsDevCacheTtlSeconds: number;
  modelsDevEnabled: boolean;
  modelAliases: Record<string, string>;
}

export interface ModelsDevMetadata {
  id: string;
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
  };
}

export type ModelsDevCatalog = Record<string, ModelsDevMetadata>;

export interface ProviderModelConfigLike {
  id: string;
  name: string;
  reasoning: boolean;
  input: InputModality[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
}
