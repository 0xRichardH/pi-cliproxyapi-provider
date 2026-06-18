import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
        input: async (title: string) => title.startsWith("Provider name") ? "cpa-test" : "http://example.test/v1",
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

test("config command keeps existing values when input is empty", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-cpa-config-command-keep-"));
  const configDir = join(cwd, ".pi", "pi-cliproxyapi-provider");
  const configPath = join(configDir, "config.json");
  const existing = { providerName: "existing-provider", baseUrl: "http://existing.test/v1", authRequired: false, authHeader: false };

  try {
    await mkdir(configDir, { recursive: true });
    await writeFile(configPath, JSON.stringify(existing, null, 2));

    let reloads = 0;
    await runConfig({
      cwd,
      hasUI: true,
      ui: {
        select: async () => "Project",
        input: async () => "",
        confirm: async () => true,
        notify: () => {},
      },
      reload: async () => { reloads += 1; },
    } as any);

    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(config.providerName, "existing-provider");
    assert.equal(config.baseUrl, "http://existing.test/v1");
    assert.equal(reloads, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
