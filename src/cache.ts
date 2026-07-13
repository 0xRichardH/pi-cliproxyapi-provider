import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface CacheEnvelope<T> {
  fetchedAt: number;
  data: T;
}

export async function readCache<T>(path: string, parseData: (value: unknown) => T): Promise<CacheEnvelope<T> | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || typeof parsed.fetchedAt !== "number" || !("data" in parsed)) {
      return undefined;
    }
    return { fetchedAt: parsed.fetchedAt, data: parseData(parsed.data) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function writeCache<T>(path: string, data: T, fetchedAt = Date.now()): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = join(directory, `.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ fetchedAt, data }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
