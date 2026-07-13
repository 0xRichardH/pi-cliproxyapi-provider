import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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

  async refresh(target: RefreshTarget = "all", mode: "background" | "manual" = "manual"): Promise<CatalogRefreshResult> {
    const result = await this.options.catalog.refresh(target, mode);
    if (result.models.updated || result.metadata.updated) this.register(result.snapshot, false);
    return result;
  }

  private register(snapshot: CatalogSnapshot, force: boolean): void {
    const models = snapshot.built.models.length > 0 ? snapshot.built.models : buildUnavailableProviderModels();
    const fingerprint = JSON.stringify(models);
    if (!force && fingerprint === this.registeredFingerprint) return;
    const registration = buildProviderRegistration(this.options.config, models);
    this.options.pi.registerProvider(registration.providerName, registration.config);
    this.registeredFingerprint = fingerprint;
  }
}
