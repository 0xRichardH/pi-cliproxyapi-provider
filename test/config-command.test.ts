import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConfig } from "../src/commands.ts";

test("config command saves project config and reloads pi", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-cpa-config-command-"));
  const notifications: string[] = [];
  let reloads = 0;

  try {
    await runConfig({
      cwd,
      hasUI: true,
      ui: {
        select: async () => "Project",
        input: async (title: string) => title === "Provider name" ? "cpa-test" : "http://example.test/v1",
        confirm: async () => true,
        notify: (message: string) => notifications.push(message),
      },
      reload: async () => { reloads += 1; },
    } as any);

    const config = JSON.parse(await readFile(join(cwd, ".pi", "pi-cliproxyapi-provider", "config.json"), "utf8"));
    assert.equal(config.providerName, "cpa-test");
    assert.equal(config.baseUrl, "http://example.test/v1");
    assert.equal(reloads, 1);
    assert.match(notifications.at(-1) ?? "", /Reloading pi/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
