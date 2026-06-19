import type { ProviderConfig } from "@earendil-works/pi-coding-agent";
import type { CpaProviderConfig } from "./types.ts";
import type { ProviderModelConfigLike } from "./types.ts";

export interface ProviderRegistration {
  providerName: string;
  config: ProviderConfig;
}

export function buildProviderRegistration(
  config: CpaProviderConfig,
  models: ProviderModelConfigLike[],
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
      models,
    },
  };
}
