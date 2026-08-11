import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PROVIDER_SETTINGS, loadProviderSettings } from "../src/settings.ts";

async function withSettingsTree<T>(fn: (cwd: string, agentDir: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "pi-cpa-settings-"));
  const cwd = join(root, "project");
  const agentDir = join(root, "agent");
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await mkdir(agentDir, { recursive: true });
  try {
    return await fn(cwd, agentDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const namespace = "pi-cliproxyapi-provider";

test("uses the canonical GPT-5.6 context window by default", async () => {
  await withSettingsTree(async (cwd, agentDir) => {
    assert.deepEqual(loadProviderSettings(cwd, agentDir), DEFAULT_PROVIDER_SETTINGS);
  });
});

test("project settings override the global GPT-5.6 context window mode", async () => {
  await withSettingsTree(async (cwd, agentDir) => {
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({
      [namespace]: { gpt56ContextWindow: "canonical" },
    }));
    await writeFile(join(cwd, ".pi", "settings.json"), JSON.stringify({
      [namespace]: { gpt56ContextWindow: "full" },
    }));

    assert.equal(loadProviderSettings(cwd, agentDir).gpt56ContextWindow, "full");
  });
});

test("rejects unsupported GPT-5.6 context window modes", async () => {
  await withSettingsTree(async (cwd, agentDir) => {
    await writeFile(join(agentDir, "settings.json"), JSON.stringify({
      [namespace]: { gpt56ContextWindow: "unbounded" },
    }));

    assert.throws(
      () => loadProviderSettings(cwd, agentDir),
      /gpt56ContextWindow must be "canonical" or "full"/,
    );
  });
});
