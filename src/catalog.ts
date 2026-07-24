import { cpaModelsCachePath, discoveryHeaders, modelsDevCachePath } from "./discovery.ts";
import { readCache, writeCache, type CacheEnvelope } from "./cache.ts";
import { fetchCpaModels, parseCpaModelsCache, type CpaModel } from "./cpa.ts";
import { fetchModelsDevCatalog, parseModelsDevCatalog, readBundledModelsDevFallback } from "./models-dev.ts";
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
  writeSnapshot?: typeof writeCache;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameCpaModels(left: CpaModel[], right: CpaModel[]): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function sameMetadata(left: ModelsDevCatalog, right: ModelsDevCatalog): boolean {
  return canonicalJson(left) === canonicalJson(right);
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
    const cpaCache = await readCache(cpaModelsCachePath(this.options.config), parseCpaModelsCache);
    const metadataSnapshot = await this.loadMetadata();
    return this.setSnapshot(cpaCache?.data ?? [], cpaCache?.fetchedAt, metadataSnapshot.data, metadataSnapshot.fetchedAt, metadataSnapshot.source);
  }

  async refresh(
    target: RefreshTarget = "all",
    mode: "background" | "manual" = "manual",
    getDiscoveryApiKey?: () => Promise<string | undefined>,
    signal?: AbortSignal,
  ): Promise<CatalogRefreshResult> {
    if (this.activeRefresh) {
      if (this.activeRefreshTarget === target && this.activeRefreshMode === mode && getDiscoveryApiKey === undefined) {
        if (!signal) return this.activeRefresh;
        if (signal.aborted) throw signal.reason ?? new Error("Refresh aborted");
        return Promise.race([
          this.activeRefresh,
          new Promise<never>((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason ?? new Error("Refresh aborted")), { once: true });
          }),
        ]);
      }
      await this.activeRefresh;
    }

    this.activeRefreshTarget = target;
    this.activeRefreshMode = mode;
    this.activeRefresh = this.performRefresh(target, mode, getDiscoveryApiKey, signal).finally(() => {
      this.activeRefresh = undefined;
      this.activeRefreshTarget = undefined;
      this.activeRefreshMode = undefined;
    });
    return this.activeRefresh;
  }

  current(): CatalogSnapshot | undefined {
    return this.snapshot;
  }

  private async performRefresh(
    target: RefreshTarget,
    mode: "background" | "manual",
    getDiscoveryApiKey?: () => Promise<string | undefined>,
    signal?: AbortSignal,
  ): Promise<CatalogRefreshResult> {
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
        const apiKey = await (getDiscoveryApiKey ?? this.options.getApiKey)();
        const fresh = await fetchCpaModels(
          this.options.config.baseUrl,
          discoveryHeaders(this.options.config, apiKey),
          mode === "background" ? this.options.backgroundTimeoutMs ?? 2_000 : this.options.manualTimeoutMs ?? 10_000,
          signal,
        );
        if (mode === "background" && current.cpaModels.length > 0 && fresh.length === 0) {
          throw new Error("CPA automatic discovery returned no models; retained the last successful snapshot");
        }
        const freshUpdatedAt = Date.now();
        const changed = !sameCpaModels(current.cpaModels, fresh);
        await (this.options.writeSnapshot ?? writeCache)(cpaModelsCachePath(this.options.config), fresh, freshUpdatedAt);
        cpaModels = fresh;
        cpaUpdatedAt = freshUpdatedAt;
        models.changed = changed;
        models.updated = true;
      } catch (error) {
        models.error = error;
      }
    }

    if (metadataResult.attempted) {
      try {
        const fresh = await fetchModelsDevCatalog(this.options.manualTimeoutMs ?? 10_000, signal);
        const freshUpdatedAt = Date.now();
        const changed = !sameMetadata(current.metadata, fresh);
        await (this.options.writeSnapshot ?? writeCache)(modelsDevCachePath(), fresh, freshUpdatedAt);
        metadata = fresh;
        metadataUpdatedAt = freshUpdatedAt;
        metadataSource = "cache";
        metadataResult.changed = changed;
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
    const cached = await readCache(modelsDevCachePath(), parseModelsDevCatalog);
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
