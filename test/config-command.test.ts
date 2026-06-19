import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runConfig } from "../src/commands.ts";

test("config command saves global config and reloads pi", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-config-command-"));
  const originalHome = process.env.HOME;
  const notifications: string[] = [];
  let reloads = 0;

  try {
    process.env.HOME = home;
    await runConfig({
      cwd: home,
      hasUI: true,
      ui: {
        input: async (title: string) => title.startsWith("Provider name") ? "cpa-test" : "http://example.test/v1",
        confirm: async () => true,
        notify: (message: string) => notifications.push(message),
      },
      reload: async () => { reloads += 1; },
    } as any);

    const config = JSON.parse(await readFile(join(home, ".pi", "agent", "pi-cliproxyapi-provider", "config.json"), "utf8"));
    assert.equal(config.providerName, "cpa-test");
    assert.equal(config.baseUrl, "http://example.test/v1");
    assert.equal(reloads, 1);
    assert.match(notifications.at(-1) ?? "", /Reloading pi/);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("config command keeps existing global values when input is empty", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-config-command-keep-"));
  const originalHome = process.env.HOME;
  const configDir = join(home, ".pi", "agent", "pi-cliproxyapi-provider");
  const configPath = join(configDir, "config.json");
  const existing = { providerName: "existing-provider", baseUrl: "http://existing.test/v1", authRequired: false, authHeader: false };

  try {
    process.env.HOME = home;
    await mkdir(configDir, { recursive: true });
    await writeFile(configPath, JSON.stringify(existing, null, 2));

    let reloads = 0;
    await runConfig({
      cwd: home,
      hasUI: true,
      ui: {
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
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("config command redacts secret-like existing global config fields", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-config-command-redact-"));
  const originalHome = process.env.HOME;
  const configDir = join(home, ".pi", "agent", "pi-cliproxyapi-provider");
  const configPath = join(configDir, "config.json");
  const notifications: string[] = [];

  try {
    process.env.HOME = home;
    await mkdir(configDir, { recursive: true });
    await writeFile(configPath, JSON.stringify({
      providerName: "existing-provider",
      baseUrl: "http://existing.test/v1",
      headers: { Authorization: "Bearer secret", "X-API-Key": "secret-key", "User-Agent": "pi" },
    }, null, 2));

    await runConfig({
      cwd: home,
      hasUI: true,
      ui: {
        input: async () => undefined,
        confirm: async () => true,
        notify: (message: string) => notifications.push(message),
      },
      reload: async () => {},
    } as any);

    const existingConfigMessage = notifications.find((message) => message.includes("Editing existing")) ?? "";
    assert.match(existingConfigMessage, /"Authorization": "<redacted>"/);
    assert.match(existingConfigMessage, /"X-API-Key": "<redacted>"/);
    assert.match(existingConfigMessage, /"User-Agent": "pi"/);
    assert.doesNotMatch(existingConfigMessage, /secret/);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});
