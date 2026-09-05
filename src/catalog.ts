import { cpaModelsCachePath, discoveryHeaders, modelsDevCachePath } from "./discovery.ts";
import { readCache, writeCache, type CacheEnvelope } from "./cache.ts";
import { fetchCpaModels, parseCpaModelsCache, type CpaModel } from "./cpa.ts";
import { fetchModelsDevCatalog, hasSourceProviderMetadata, parseModelsDevCatalog, readBundledModelsDevFallback } from "./models-dev.ts";
import { buildProviderModels, type BuildProviderModelsResult } from "./provider.ts";
import type { Gpt56ContextWindowMode } from "./settings.ts";
import type { CpaProviderConfig, ModelsDevCatalog } from "./types.ts";

export type MetadataSource = "cache" | "bundled" | "disabled";

/**
 * `models-if-stale` is the routine target Pi's own `refreshModels` hook uses:
 * always re-discover CPA's model list, and piggyback a models.dev fetch only
 * when the metadata snapshot is stale (see {@link ProviderCatalog.metadataIsStale}).
 * The other targets are explicit and always attempt what they name.
 */
export type RefreshTarget = "models" | "metadata" | "all" | "models-if-stale";

/**
 * How old a models.dev snapshot may get before a routine refresh re-fetches
 * it. models.dev changes slowly — a model's pricing and limits do not move
 * between sessions — but a new model family lands every few weeks, and until
 * the snapshot catches up its entries render with pi's bare fallback metadata
 * (16384 output tokens, text only, zero cost). A week keeps the ~7 MB download
 * rare while making that window self-heal without anyone running
 * `/cliproxyapi refresh metadata`.
 */
export const METADATA_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface CatalogSnapshot {
  cpaModels: CpaModel[];
  cpaUpdatedAt?: number;
  metadata: ModelsDevCatalog;
  metadataUpdatedAt?: number;
  metadataSource: MetadataSource;
  gpt56ContextWindow: Gpt56ContextWindowMode;
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
  gpt56ContextWindow: Gpt56ContextWindowMode;
  bundledModelsDevPath: string;
  getApiKey: () => Promise<string | undefined>;
  backgroundTimeoutMs?: number;
  manualTimeoutMs?: number;
  /** Budget for a models.dev fetch riding on a background refresh. Defaults to the manual timeout. */
  metadataBackgroundTimeoutMs?: number;
  /** Age after which a routine refresh re-fetches models.dev. Defaults to {@link METADATA_STALE_AFTER_MS}. */
  metadataStaleAfterMs?: number;
  writeSnapshot?: typeof writeCache;
  now?: () => number;
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
  private activeRefreshController?: AbortController;
  private readonly activeRefreshWaiters = new Set<symbol>();
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
      if (this.activeRefreshTarget === target && this.activeRefreshMode === mode) {
        return this.waitForActiveRefresh(signal);
      }
      await this.activeRefresh;
    }

    const controller = new AbortController();
    this.activeRefreshTarget = target;
    this.activeRefreshMode = mode;
    this.activeRefreshController = controller;
    this.activeRefresh = this.performRefresh(target, mode, getDiscoveryApiKey, controller.signal).finally(() => {
      this.activeRefresh = undefined;
      this.activeRefreshTarget = undefined;
      this.activeRefreshMode = undefined;
      this.activeRefreshController = undefined;
      this.activeRefreshWaiters.clear();
    });
    return this.waitForActiveRefresh(signal);
  }

  current(): CatalogSnapshot | undefined {
    return this.snapshot;
  }

  /**
   * Whether a routine refresh should re-fetch models.dev.
   *
   * Stale means: metadata is enabled, and the snapshot is either the bundled
   * first-run seed (which is frozen at package-publish time and only ever gets
   * older) or a cached fetch older than the configured threshold. A cached
   * snapshot with no timestamp is treated as stale rather than trusted forever.
   */
  metadataIsStale(snapshot: Pick<CatalogSnapshot, "metadataSource" | "metadataUpdatedAt"> | undefined = this.snapshot): boolean {
    if (!this.options.config.modelsDevEnabled) return false;
    if (!snapshot) return true;
    if (snapshot.metadataSource !== "cache") return true;
    if (snapshot.metadataUpdatedAt === undefined) return true;
    const now = (this.options.now ?? Date.now)();
    return now - snapshot.metadataUpdatedAt >= (this.options.metadataStaleAfterMs ?? METADATA_STALE_AFTER_MS);
  }

  private async waitForActiveRefresh(signal?: AbortSignal): Promise<CatalogRefreshResult> {
    const refresh = this.activeRefresh;
    if (!refresh) throw new Error("No active refresh");
    if (signal?.aborted) throw signal.reason ?? new Error("Refresh aborted");

    const waiter = Symbol("refresh-waiter");
    this.activeRefreshWaiters.add(waiter);
    let onAbort: (() => void) | undefined;
    const aborted = signal
      ? new Promise<never>((_resolve, reject) => {
        onAbort = () => {
          this.activeRefreshWaiters.delete(waiter);
          if (this.activeRefreshWaiters.size === 0) {
            this.activeRefreshController?.abort(signal.reason ?? new Error("Refresh aborted"));
          }
          reject(signal.reason ?? new Error("Refresh aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      })
      : undefined;

    try {
      return await (aborted ? Promise.race([refresh, aborted]) : refresh);
    } finally {
      this.activeRefreshWaiters.delete(waiter);
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    }
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
    const attemptMetadata = target === "models-if-stale"
      ? this.metadataIsStale(current)
      : target !== "models" && this.options.config.modelsDevEnabled;
    const metadataResult: SourceRefreshResult = { attempted: attemptMetadata, updated: false, changed: false };

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
        if (signal?.aborted) throw signal.reason ?? error;
        models.error = error;
      }
    }

    if (metadataResult.attempted) {
      try {
        // A stale-triggered fetch rides on a background refresh, so it gets the
        // (larger) metadata budget rather than the 2 s CPA discovery budget:
        // models.dev is a ~7 MB document, and pi publishes whatever this returns
        // rather than blocking the model selector on it.
        const timeoutMs = mode === "background"
          ? this.options.metadataBackgroundTimeoutMs ?? this.options.manualTimeoutMs ?? 10_000
          : this.options.manualTimeoutMs ?? 10_000;
        const fresh = await fetchModelsDevCatalog(timeoutMs, signal);
        const freshUpdatedAt = Date.now();
        const changed = !sameMetadata(current.metadata, fresh);
        await (this.options.writeSnapshot ?? writeCache)(modelsDevCachePath(), fresh, freshUpdatedAt);
        metadata = fresh;
        metadataUpdatedAt = freshUpdatedAt;
        metadataSource = "cache";
        metadataResult.changed = changed;
        metadataResult.updated = true;
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error;
        metadataResult.error = error;
      }
    }

    const snapshot = this.setSnapshot(cpaModels, cpaUpdatedAt, metadata, metadataUpdatedAt, metadataSource);
    return { snapshot, models, metadata: metadataResult };
  }

  private async loadMetadata(): Promise<{ data: ModelsDevCatalog; fetchedAt?: number; source: MetadataSource }> {
    if (!this.options.config.modelsDevEnabled) return { data: {}, source: "disabled" };
    const cached = await readCache(modelsDevCachePath(), parseModelsDevCatalog);
    if (cached && hasSourceProviderMetadata(cached.data)) {
      return { data: cached.data, fetchedAt: cached.fetchedAt, source: "cache" };
    }
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
      gpt56ContextWindow: this.options.gpt56ContextWindow,
      built: buildProviderModels(
        cpaModels,
        metadata,
        this.options.config.modelAliases,
        this.options.gpt56ContextWindow,
        this.options.config.modelOverrides,
        this.options.config.metadataFallbackProvider,
      ),
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
