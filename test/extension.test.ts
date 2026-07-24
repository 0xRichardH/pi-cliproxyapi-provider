import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension from "../extensions/index.ts";

async function withTempCwd<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), "pi-cpa-extension-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(cwd);
    return await fn(cwd);
  } finally {
    process.chdir(originalCwd);
    await rm(cwd, { recursive: true, force: true });
  }
}

test("extension registers provider with refreshModels capability", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-extension-lifecycle-home-"));
  const originalHome = process.env.HOME;
  const originalFetch = globalThis.fetch;

  try {
    process.env.HOME = home;
    globalThis.fetch = (async (url: string | URL | Request) => {
      assert.equal(String(url), "http://localhost:8317/v1/models");
      return new Response(JSON.stringify({ data: [{ id: "fresh-model" }] }), { status: 200 });
    }) as typeof fetch;

    await withTempCwd(async () => {
      const providers: Array<{ name: string; config: any }> = [];
      await extension({
        registerCommand: () => {},
        registerProvider: (name: string, config: any) => providers.push({ name, config }),
        on: () => {},
      } as any);

      assert.equal(providers[0].config.models[0].id, "login-required");
      assert.equal(typeof providers[0].config.refreshModels, "function");

      const refreshed = await providers[0].config.refreshModels({ allowNetwork: true });
      assert.equal(refreshed[0].id, "fresh-model");
      assert.equal(providers.at(-1)?.config.models[0].id, "fresh-model");
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("manual refresh uses the active model registry credential", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-extension-refresh-home-"));
  const originalHome = process.env.HOME;
  const originalFetch = globalThis.fetch;

  try {
    process.env.HOME = home;
    await withTempCwd(async (cwd) => {
      let commandHandler: ((args: string, ctx: any) => Promise<void>) | undefined;
      let receivedAuthorization: string | null = null;
      globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        receivedAuthorization = headers.get("Authorization");
        if (receivedAuthorization !== "Bearer runtime-key") {
          return new Response("unauthorized", { status: 401, statusText: "Unauthorized" });
        }
        return new Response(JSON.stringify({ data: [{ id: "fresh-model" }] }), { status: 200 });
      }) as typeof fetch;

      await extension({
        registerCommand: (_name: string, options: any) => { commandHandler = options.handler; },
        registerProvider: () => {},
        on: () => {},
      } as any);

      const notifications: Array<{ message: string; level: string }> = [];
      await commandHandler?.("refresh models", {
        cwd,
        modelRegistry: {
          getApiKeyForProvider: async (providerName: string) => {
            assert.equal(providerName, "cpa");
            return "runtime-key";
          },
        },
        ui: {
          notify: (message: string, level: string) => notifications.push({ message, level }),
        },
      });

      assert.equal(receivedAuthorization, "Bearer runtime-key");
      assert.equal(notifications.at(-1)?.level, "info");
      assert.doesNotMatch(notifications.at(-1)?.message ?? "", /401 Unauthorized/);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("extension registers placeholder provider when global config is invalid", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-extension-home-"));
  const originalHome = process.env.HOME;

  try {
    process.env.HOME = home;
    await withTempCwd(async () => {
      const configDir = join(home, ".pi", "agent", "pi-cliproxyapi-provider");
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, "config.json"), JSON.stringify({ headers: null }));

      const providers: Array<{ name: string; config: any }> = [];
      await extension({
        registerCommand: () => {},
        registerProvider: (name: string, config: any) => providers.push({ name, config }),
        on: () => {},
      } as any);

      assert.equal(providers.length, 1);
      assert.equal(providers[0].name, "cpa");
      assert.equal(providers[0].config.models[0].id, "login-required");
    });
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});
