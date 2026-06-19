import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface CacheEnvelope<T> {
  fetchedAt: number;
  data: T;
}

export async function readCache<T>(path: string): Promise<CacheEnvelope<T> | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || typeof parsed.fetchedAt !== "number" || !("data" in parsed)) {
      return undefined;
    }
    return parsed as CacheEnvelope<T>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function writeCache<T>(path: string, data: T, fetchedAt = Date.now()): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify({ fetchedAt, data }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function isFresh(cache: Pick<CacheEnvelope<unknown>, "fetchedAt"> | undefined, ttlSeconds: number, now = Date.now()): boolean {
  if (!cache || ttlSeconds <= 0 || cache.fetchedAt > now) return false;
  return now - cache.fetchedAt < ttlSeconds * 1000;
}

export async function getCachedOrFetch<T>(options: {
  path: string;
  ttlSeconds: number;
  fetchFresh: () => Promise<T>;
  now?: number;
  force?: boolean;
}): Promise<{ data: T; source: "fresh" | "cache" | "stale"; error?: unknown }> {
  const cached = await readCache<T>(options.path);
  const now = options.now ?? Date.now();
  if (!options.force && isFresh(cached, options.ttlSeconds, now)) {
    return { data: cached!.data, source: "cache" };
  }

  try {
    const fresh = await options.fetchFresh();
    await writeCache(options.path, fresh, now);
    return { data: fresh, source: "fresh" };
  } catch (error) {
    if (cached) {
      return { data: cached.data, source: "stale", error };
    }
    throw error;
  }
}
