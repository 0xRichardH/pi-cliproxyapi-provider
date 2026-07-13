import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCache, writeCache } from "../src/cache.ts";

test("writes and reads cache envelopes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-cpa-cache-"));
  try {
    const path = join(dir, "cache.json");
    await writeCache(path, [{ id: "gpt-5.5" }], 1000);
    const cached = await readCache(path, (value) => value as { id: string }[]);

    assert.deepEqual(cached?.data, [{ id: "gpt-5.5" }]);
    assert.equal(cached?.fetchedAt, 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
