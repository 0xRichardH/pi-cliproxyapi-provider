import { cpaModelsCachePath, discoveryHeaders, modelsDevCachePath } from "./discovery.ts";
import { readCache, writeCache, type CacheEnvelope } from "./cache.ts";
import { fetchCpaModels, type CpaModel } from "./cpa.ts";
import { fetchModelsDevCatalog, readBundledModelsDevFallback } from "./models-dev.ts";
import { buildProviderModels, type BuildProviderModelsResult } from "./provider.ts";
import type { CpaProviderConfig, ModelsDevCatalog } from "./types.ts";

export type MetadataSource = "cache" | "bundled" | "disabled";
export type RefreshTarget = "models" | "metadata" | "all";

export interface CatalogSnapshot {
  cpaModels: CpaModel[];
  cpaUpdatedAt?: number;
  metadata: ModelsDevCatalog;
  metadataUpdatedAt?: number;
  metadataSource: MetadataSource;
  built: BuildProviderModelsResult;
}

export interface SourceRefreshResult {
  attempted: boolean;
  updated: boolean;
  changed: boolean;
  error?: unknown;
}

export interface CatalogRefreshResult {
  snapshot: CatalogSnapshot;
  models: SourceRefreshResult;
  metadata: SourceRefreshResult;
}

export interface ProviderCatalogOptions {
  config: CpaProviderConfig;
  bundledModelsDevPath: string;
  getApiKey: () => Promise<string | undefined>;
  backgroundTimeoutMs?: number;
  manualTimeoutMs?: number;
}

function sameCpaModels(left: CpaModel[], right: CpaModel[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameMetadata(left: ModelsDevCatalog, right: ModelsDevCatalog): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class ProviderCatalog {
  private snapshot?: CatalogSnapshot;
  private activeRefresh?: Promise<CatalogRefreshResult>;
  private activeRefreshTarget?: RefreshTarget;
  private activeRefreshMode?: "background" | "manual";
  private readonly options: ProviderCatalogOptions;

  constructor(options: ProviderCatalogOptions) {
    this.options = options;
  }

  async load(): Promise<CatalogSnapshot> {
    const cpaCache = await readCache<CpaModel[]>(cpaModelsCachePath(this.options.config));
    const metadataSnapshot = await this.loadMetadata();
    return this.setSnapshot(cpaCache?.data ?? [], cpaCache?.fetchedAt, metadataSnapshot.data, metadataSnapshot.fetchedAt, metadataSnapshot.source);
  }

  async refresh(target: RefreshTarget = "all", mode: "background" | "manual" = "manual"): Promise<CatalogRefreshResult> {
    if (this.activeRefresh) {
      if (this.activeRefreshTarget === target && this.activeRefreshMode === mode) return this.activeRefresh;
      await this.activeRefresh;
    }

    this.activeRefreshTarget = target;
    this.activeRefreshMode = mode;
    this.activeRefresh = this.performRefresh(target, mode).finally(() => {
      this.activeRefresh = undefined;
      this.activeRefreshTarget = undefined;
      this.activeRefreshMode = undefined;
    });
    return this.activeRefresh;
  }

  current(): CatalogSnapshot | undefined {
    return this.snapshot;
  }

  private async performRefresh(target: RefreshTarget, mode: "background" | "manual"): Promise<CatalogRefreshResult> {
    const current = this.snapshot ?? await this.load();
    let cpaModels = current.cpaModels;
    let cpaUpdatedAt = current.cpaUpdatedAt;
    let metadata = current.metadata;
    let metadataUpdatedAt = current.metadataUpdatedAt;
    let metadataSource = current.metadataSource;

    const models: SourceRefreshResult = { attempted: target !== "metadata", updated: false, changed: false };
    const metadataResult: SourceRefreshResult = { attempted: target !== "models" && this.options.config.modelsDevEnabled, updated: false, changed: false };

    if (models.attempted) {
      try {
        const apiKey = await this.options.getApiKey();
        const fresh = await fetchCpaModels(
          this.options.config.baseUrl,
          discoveryHeaders(this.options.config, apiKey),
          mode === "background" ? this.options.backgroundTimeoutMs ?? 2_000 : this.options.manualTimeoutMs ?? 10_000,
        );
        if (mode === "background" && current.cpaModels.length > 0 && fresh.length === 0) {
          throw new Error("CPA automatic discovery returned no models; retained the last successful snapshot");
        }
        models.changed = !sameCpaModels(current.cpaModels, fresh);
        cpaModels = fresh;
        cpaUpdatedAt = Date.now();
        await writeCache(cpaModelsCachePath(this.options.config), fresh, cpaUpdatedAt);
        models.updated = true;
      } catch (error) {
        models.error = error;
      }
    }

    if (metadataResult.attempted) {
      try {
        const fresh = await fetchModelsDevCatalog(this.options.manualTimeoutMs ?? 10_000);
        metadataResult.changed = !sameMetadata(current.metadata, fresh);
        metadata = fresh;
        metadataUpdatedAt = Date.now();
        metadataSource = "cache";
        await writeCache(modelsDevCachePath(), fresh, metadataUpdatedAt);
        metadataResult.updated = true;
      } catch (error) {
        metadataResult.error = error;
      }
    }

    const snapshot = this.setSnapshot(cpaModels, cpaUpdatedAt, metadata, metadataUpdatedAt, metadataSource);
    return { snapshot, models, metadata: metadataResult };
  }

  private async loadMetadata(): Promise<{ data: ModelsDevCatalog; fetchedAt?: number; source: MetadataSource }> {
    if (!this.options.config.modelsDevEnabled) return { data: {}, source: "disabled" };
    const cached = await readCache<ModelsDevCatalog>(modelsDevCachePath());
    if (cached) return { data: cached.data, fetchedAt: cached.fetchedAt, source: "cache" };
    return { data: await readBundledModelsDevFallback(this.options.bundledModelsDevPath), source: "bundled" };
  }

  private setSnapshot(
    cpaModels: CpaModel[],
    cpaUpdatedAt: number | undefined,
    metadata: ModelsDevCatalog,
    metadataUpdatedAt: number | undefined,
    metadataSource: MetadataSource,
  ): CatalogSnapshot {
    this.snapshot = {
      cpaModels,
      cpaUpdatedAt,
      metadata,
      metadataUpdatedAt,
      metadataSource,
      built: buildProviderModels(cpaModels, metadata, this.options.config.modelAliases),
    };
    return this.snapshot;
  }
}

export function cacheAge(envelope: Pick<CacheEnvelope<unknown>, "fetchedAt"> | undefined, now = Date.now()): string {
  if (!envelope) return "missing";
  const seconds = Math.max(0, Math.round((now - envelope.fetchedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}
