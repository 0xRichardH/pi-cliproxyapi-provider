import type { RefreshModelsContext } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { getDiscoveryApiKey } from "./auth.ts";
import { ProviderCatalog, type CatalogRefreshResult, type CatalogSnapshot, type RefreshTarget } from "./catalog.ts";
import { buildUnavailableProviderModels } from "./provider.ts";
import { buildProviderRegistration } from "./registration.ts";
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
      return (snapshot.built.models.length > 0 ? snapshot.built.models : buildUnavailableProviderModels()) as ProviderModelConfig[];
    }
    const mode = context.force ? "manual" : "background";
    const credential = context.credential;
    const keyFn: () => Promise<string | undefined> = credential?.type === "api_key"
      ? async () => credential.key
      : () => getDiscoveryApiKey(this.options.config.providerName);
    const result = await this.options.catalog.refresh("models", mode, keyFn, context.signal);
    const models = (result.snapshot.built.models.length > 0 ? result.snapshot.built.models : buildUnavailableProviderModels()) as ProviderModelConfig[];
    this.register(result.snapshot, false);
    return models;
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
