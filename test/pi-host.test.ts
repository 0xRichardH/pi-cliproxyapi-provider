import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// PI_HOST_PACKAGE may point to a separately installed, version-pinned Pi package.
test("Pi host resolves credentials and reloads changed CPA configuration", async () => {
  const packageDir = process.env.PI_HOST_PACKAGE ?? resolve("node_modules/@earendil-works/pi-coding-agent");
  const pi = await import(pathToFileURL(join(packageDir, "dist/index.js")).href);
  const home = await mkdtemp(join(tmpdir(), "cpa-pi-host-"));
  const oldHome = process.env.HOME;
  const oldFetch = globalThis.fetch;
  const cpaEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("CLIPROXYAPI_")));
  for (const name of Object.keys(cpaEnv)) delete process.env[name];
  const cwd = process.cwd();
  process.env.HOME = home;
  process.chdir(home);
  let session: any;
  try {
    const agentDir = join(home, ".pi/agent");
    const configDir = join(agentDir, "pi-cliproxyapi-provider");
    await mkdir(configDir, { recursive: true });
    const setExpression = (apiKey: string) => writeFile(join(configDir, "config.json"), JSON.stringify({ apiKey, modelsDevEnabled: false }));
    await setExpression("!printf synthetic-one");
    const seen: (string | null)[] = [];
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("authorization"));
      return new Response(JSON.stringify({ data: [{ id: "synthetic-model" }] }), { status: 200 });
    }) as typeof fetch;
    const loader = new pi.DefaultResourceLoader({ cwd: home, agentDir, additionalExtensionPaths: [join(cwd, "extensions/index.ts")], noSkills: true, noThemes: true, noPromptTemplates: true, noContextFiles: true });
    await loader.reload();
    assert.deepEqual(loader.getExtensions().errors, []);
    const { AuthStorage } = await import(pathToFileURL(join(packageDir, "dist/core/auth-storage.js")).href);
    const credentials = AuthStorage.inMemory();
    const runtime = await pi.ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false });
    ({ session } = await pi.createAgentSession({ cwd: home, agentDir, modelRuntime: runtime, resourceLoader: loader, sessionManager: pi.SessionManager.inMemory(), noTools: "all" }));
    const result = await runtime.refresh({ providers: ["cpa"], allowNetwork: true, force: true });
    assert.equal(result.errors.size, 0);
    assert.equal(seen.at(-1), "Bearer synthetic-one");
    assert.ok(runtime.getModel("cpa", "synthetic-model"));
    await setExpression("!printf synthetic-two");
    await session.reload();
    const afterReload = await runtime.refresh({ providers: ["cpa"], allowNetwork: true, force: true });
    assert.equal(afterReload.errors.size, 0);
    assert.equal(seen.at(-1), "Bearer synthetic-two");
    const keyFile = join(home, "synthetic-key");
    await writeFile(keyFile, "synthetic-rotated-one");
    await setExpression(`!cat '${keyFile}'`);
    await session.reload();
    await runtime.refresh({ providers: ["cpa"], allowNetwork: true, force: true });
    assert.equal(seen.at(-1), "Bearer synthetic-rotated-one");
    await writeFile(keyFile, "synthetic-rotated-two");
    await runtime.refresh({ providers: ["cpa"], allowNetwork: true, force: true });
    assert.equal(seen.at(-1), "Bearer synthetic-rotated-two");

    const manual = async () => {
      const runner = session.extensionRunner;
      const command = runner.getCommand("cliproxyapi");
      assert.ok(command);
      const context = runner.createCommandContext();
      const notifications: string[] = [];
      context.ui.notify = (message: string) => notifications.push(message);
      await command.handler("refresh models", context);
      return notifications;
    };
    await manual();
    assert.equal(seen.at(-1), "Bearer synthetic-rotated-two");
    await credentials.modify("cpa", async () => ({ type: "api_key", key: "synthetic-saved" }));
    await runtime.refresh({ providers: ["cpa"], allowNetwork: true, force: true });
    assert.equal(seen.at(-1), "Bearer synthetic-saved");
    await manual();
    assert.equal(seen.at(-1), "Bearer synthetic-saved");
    await runtime.setRuntimeApiKey("cpa", "synthetic-runtime");
    await runtime.refresh({ providers: ["cpa"], allowNetwork: true, force: true });
    assert.equal(seen.at(-1), "Bearer synthetic-runtime");
    await manual();
    assert.equal(seen.at(-1), "Bearer synthetic-runtime");
    await runtime.removeRuntimeApiKey("cpa");
    await credentials.delete("cpa");

    await setExpression("!exit 1");
    await session.reload();
    const count = seen.length;
    const failed = await runtime.refresh({ providers: ["cpa"], allowNetwork: true, force: true });
    assert.ok(failed.errors.has("cpa"));
    assert.equal(seen.length, count);
    assert.ok(runtime.getModel("cpa", "synthetic-model"));
    const notifications = await manual();
    assert.match(notifications.join("\n"), /error|failed/i);
    assert.equal(seen.length, count);
    assert.ok(runtime.getModel("cpa", "synthetic-model"));
    assert.ok(seen.every((header) => header !== null && !header.includes("!")));

    await setExpression("!printf synthetic-valid");
    await session.reload();
    globalThis.fetch = (async () => new Response("unauthorized", { status: 401, statusText: "Unauthorized" })) as typeof fetch;
    // Normal host refresh retains the cache but currently does not surface catalog HTTP errors.
    const unauthorized = await runtime.refresh({ providers: ["cpa"], allowNetwork: true, force: true });
    assert.equal(unauthorized.errors.size, 0);
    assert.ok(runtime.getModel("cpa", "synthetic-model"));
    assert.match((await manual()).join("\n"), /401/);
  } finally {
    session?.dispose();
    process.chdir(cwd);
    globalThis.fetch = oldFetch;
    for (const name of Object.keys(process.env)) if (name.startsWith("CLIPROXYAPI_")) delete process.env[name];
    Object.assign(process.env, cpaEnv);
    if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
    await rm(home, { recursive: true, force: true });
  }
});
