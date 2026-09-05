import type { RefreshModelsContext } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { getDiscoveryApiKey } from "./auth.ts";
import { ProviderCatalog, type CatalogRefreshResult, type CatalogSnapshot, type RefreshTarget } from "./catalog.ts";
import { buildUnavailableProviderModels } from "./provider.ts";
import { buildProviderRegistration, normalizeProviderModels } from "./registration.ts";
import type { CpaProviderConfig } from "./types.ts";

export interface ProviderRuntimeOptions {
  pi: ExtensionAPI;
  config: CpaProviderConfig;
  catalog: ProviderCatalog;
}

export class ProviderRuntime {
  private registeredFingerprint?: string;
  private readonly options: ProviderRuntimeOptions;

  constructor(options: ProviderRuntimeOptions) {
    this.options = options;
  }

  async start(): Promise<CatalogSnapshot> {
    const snapshot = await this.options.catalog.load();
    this.register(snapshot, true);
    return snapshot;
  }

  async refresh(
    target: RefreshTarget = "all",
    mode: "background" | "manual" = "manual",
    getDiscoveryApiKey?: () => Promise<string | undefined>,
  ): Promise<CatalogRefreshResult> {
    const result = await this.options.catalog.refresh(target, mode, getDiscoveryApiKey);
    if (result.models.updated || result.metadata.updated) this.register(result.snapshot, false);
    return result;
  }

  async refreshModels(context: RefreshModelsContext): Promise<ProviderModelConfig[]> {
    if (!context.allowNetwork) {
      const snapshot = await this.options.catalog.load();
      return normalizeProviderModels(
        snapshot.built.models.length > 0 ? snapshot.built.models : buildUnavailableProviderModels(),
        this.options.config.baseUrl,
      );
    }
    const mode = context.force ? "manual" : "background";
    const credential = context.credential;
    const keyFn: () => Promise<string | undefined> = credential?.type === "api_key"
      ? async () => credential.key
      : () => getDiscoveryApiKey(this.options.config.providerName);
    // Pi calls this at startup and whenever the model selector opens. CPA's
    // model list is always re-discovered; models.dev metadata is re-fetched
    // only once it has gone stale, so a newly listed model stops rendering
    // with fallback metadata without anyone running a manual refresh.
    const result = await this.options.catalog.refresh("models-if-stale", mode, keyFn, context.signal);
    // Pi publishes refreshModels' return value synchronously. Registering here as
    // well would create a second, competing catalog publication.
    return normalizeProviderModels(
      result.snapshot.built.models.length > 0
        ? result.snapshot.built.models
        : buildUnavailableProviderModels(),
      this.options.config.baseUrl,
    );
  }

  private register(snapshot: CatalogSnapshot, force: boolean): void {
    const models = snapshot.built.models.length > 0 ? snapshot.built.models : buildUnavailableProviderModels();
    const fingerprint = JSON.stringify(models);
    if (!force && fingerprint === this.registeredFingerprint) return;
    const registration = buildProviderRegistration(this.options.config, models, (ctx) => this.refreshModels(ctx));
    this.options.pi.registerProvider(registration.providerName, registration.config);
    this.registeredFingerprint = fingerprint;
  }
}
