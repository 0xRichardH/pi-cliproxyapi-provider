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

test("extension starts from snapshots and refreshes CPA models after session start", async () => {
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
      let sessionStart: ((event: any, ctx: any) => void) | undefined;
      await extension({
        registerCommand: () => {},
        registerProvider: (name: string, config: any) => providers.push({ name, config }),
        on: (event: string, handler: any) => { if (event === "session_start") sessionStart = handler; },
      } as any);

      assert.equal(providers[0].config.models[0].id, "login-required");
      sessionStart?.({ reason: "startup" }, { hasUI: false, ui: { setStatus: () => {} } });
      const deadline = Date.now() + 2_000;
      while (providers.at(-1)?.config.models[0].id !== "fresh-model" && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(providers.at(-1)?.config.models[0].id, "fresh-model");
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
