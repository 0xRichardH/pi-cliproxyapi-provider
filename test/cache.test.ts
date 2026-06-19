import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCache, writeCache, isFresh } from "../src/cache.ts";

test("writes and reads cache envelopes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-cpa-cache-"));
  try {
    const path = join(dir, "cache.json");
    await writeCache(path, [{ id: "gpt-5.5" }], 1000);
    const cached = await readCache<{ id: string }[]>(path);

    assert.deepEqual(cached?.data, [{ id: "gpt-5.5" }]);
    assert.equal(cached?.fetchedAt, 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("checks cache freshness by TTL", () => {
  assert.equal(isFresh({ fetchedAt: 1000, data: [] }, 10, 10_500), true);
  assert.equal(isFresh({ fetchedAt: 1000, data: [] }, 10, 12_000), false);
});

test("treats future timestamps and non-positive TTLs as stale", () => {
  assert.equal(isFresh({ fetchedAt: 20_000, data: [] }, 10, 10_000), false);
  assert.equal(isFresh({ fetchedAt: 1000, data: [] }, 0, 1000), false);
  assert.equal(isFresh({ fetchedAt: 1000, data: [] }, -1, 1000), false);
});
