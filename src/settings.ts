import { CONFIG_DIR_NAME, getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const PROVIDER_SETTINGS_NAMESPACE = "pi-cliproxyapi-provider";

export type Gpt56ContextWindowMode = "canonical" | "full";

export interface ProviderSettings {
  gpt56ContextWindow: Gpt56ContextWindowMode;
  showStrictMode: boolean;
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  gpt56ContextWindow: "canonical",
  showStrictMode: false,
};

function parseSettingsLayer(settings: unknown, scope: string): Partial<ProviderSettings> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const namespace = (settings as Record<string, unknown>)[PROVIDER_SETTINGS_NAMESPACE];
  if (namespace === undefined) return {};
  if (!namespace || typeof namespace !== "object" || Array.isArray(namespace)) {
    throw new Error(`${PROVIDER_SETTINGS_NAMESPACE} must be an object in ${scope} settings.json`);
  }

  const record = namespace as Record<string, unknown>;
  const gpt56ContextWindow = record.gpt56ContextWindow;
  if (gpt56ContextWindow !== undefined && gpt56ContextWindow !== "canonical" && gpt56ContextWindow !== "full") {
    throw new Error(
      `${PROVIDER_SETTINGS_NAMESPACE}.gpt56ContextWindow must be "canonical" or "full" in ${scope} settings.json`,
    );
  }
  if (record.showStrictMode !== undefined && typeof record.showStrictMode !== "boolean") {
    throw new Error(`${PROVIDER_SETTINGS_NAMESPACE}.showStrictMode must be a boolean in ${scope} settings.json`);
  }
  return {
    ...(gpt56ContextWindow !== undefined ? { gpt56ContextWindow } : {}),
    ...(record.showStrictMode !== undefined ? { showStrictMode: record.showStrictMode } : {}),
  };
}

export function loadProviderSettings(cwd: string, agentDir?: string): ProviderSettings {
  const manager = SettingsManager.create(cwd, agentDir);
  return {
    ...DEFAULT_PROVIDER_SETTINGS,
    ...parseSettingsLayer(manager.getGlobalSettings(), "global"),
    ...parseSettingsLayer(manager.getProjectSettings(), "project"),
  };
}

function settingsPath(cwd: string): string {
  const projectPath = join(cwd, CONFIG_DIR_NAME, "settings.json");
  return existsSync(projectPath) ? projectPath : join(getAgentDir(), "settings.json");
}

export function saveProviderSettings(cwd: string, patch: Partial<ProviderSettings>): string {
  const path = settingsPath(cwd);
  let root: Record<string, unknown> = {};
  if (existsSync(path)) {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Settings file must contain a JSON object: ${path}`);
    }
    root = parsed as Record<string, unknown>;
  }

  const existing = parseSettingsLayer(root, path);
  const next = { ...existing, ...patch };
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({ ...root, [PROVIDER_SETTINGS_NAMESPACE]: next }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return path;
}
