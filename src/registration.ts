import type { RefreshModelsContext } from "@earendil-works/pi-ai";
import type { ProviderConfig, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { CpaProviderConfig } from "./types.ts";
import type { ProviderModelConfigLike } from "./types.ts";

export interface ProviderRegistration {
  providerName: string;
  config: ProviderConfig;
}

export function normalizeProviderModels(models: ProviderModelConfigLike[]): ProviderModelConfig[] {
  return models.map((model) => ({
    ...model,
    // CLIProxyAPI accepts OpenAI-compatible function tools for both Chat
    // Completions and Responses models, but Pi's strict all-properties-required
    // rewrite destroys optional argument semantics for multi-mode extension
    // tools. Keep each model's API selection and disable only that rewrite.
    compat: {
      ...model.compat,
      supportsStrictMode: false,
    },
  })) as ProviderModelConfig[];
}

export function buildProviderRegistration(
  config: CpaProviderConfig,
  models: ProviderModelConfigLike[],
  refreshModels?: (context: RefreshModelsContext) => Promise<ProviderModelConfig[]>,
): ProviderRegistration {
  return {
    providerName: config.providerName,
    config: {
      name: `CLIProxyAPI (${config.providerName})`,
      baseUrl: config.baseUrl,
      api: "openai-completions",
      apiKey: config.authRequired ? "$CLIPROXYAPI_API_KEY" : "cliproxyapi-no-auth",
      authHeader: config.authRequired && config.authHeader,
      headers: Object.keys(config.headers).length > 0 ? config.headers : undefined,
      models: normalizeProviderModels(models),
      refreshModels,
    },
  };
}
