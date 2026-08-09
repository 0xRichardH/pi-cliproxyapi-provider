import { SettingsManager } from "@earendil-works/pi-coding-agent";

export const PROVIDER_SETTINGS_NAMESPACE = "pi-cliproxyapi-provider";

export type Gpt56ContextWindowMode = "canonical" | "full";

export interface ProviderSettings {
  gpt56ContextWindow: Gpt56ContextWindowMode;
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  gpt56ContextWindow: "canonical",
};

function parseSettingsLayer(settings: unknown, scope: string): Partial<ProviderSettings> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const namespace = (settings as Record<string, unknown>)[PROVIDER_SETTINGS_NAMESPACE];
  if (namespace === undefined) return {};
  if (!namespace || typeof namespace !== "object" || Array.isArray(namespace)) {
    throw new Error(`${PROVIDER_SETTINGS_NAMESPACE} must be an object in ${scope} settings.json`);
  }

  const value = (namespace as Record<string, unknown>).gpt56ContextWindow;
  if (value === undefined) return {};
  if (value !== "canonical" && value !== "full") {
    throw new Error(
      `${PROVIDER_SETTINGS_NAMESPACE}.gpt56ContextWindow must be "canonical" or "full" in ${scope} settings.json`,
    );
  }
  return { gpt56ContextWindow: value };
}

export function loadProviderSettings(cwd: string, agentDir?: string): ProviderSettings {
  const manager = SettingsManager.create(cwd, agentDir);
  return {
    ...DEFAULT_PROVIDER_SETTINGS,
    ...parseSettingsLayer(manager.getGlobalSettings(), "global"),
    ...parseSettingsLayer(manager.getProjectSettings(), "project"),
  };
}
