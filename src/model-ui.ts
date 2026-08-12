import { DynamicBorder, getSettingsListTheme, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Container, Key, matchesKey, type SelectItem, SelectList, type SettingItem, SettingsList, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  CONTEXT_WINDOW_PRESETS,
  loadModelOverrideLayers,
  MAX_TOKEN_PRESETS,
  saveModelOverride,
} from "./config.ts";
import type { ProviderCatalog } from "./catalog.ts";
import { normalizeProviderModels } from "./registration.ts";
import { saveProviderSettings, type ProviderSettings } from "./settings.ts";
import type {
  CpaProviderConfig,
  ProviderModelConfigLike,
  ProviderModelOverride,
  ProviderModelOverrideLayer,
} from "./types.ts";

function modelOverride(model: ProviderModelConfigLike, overrides: Record<string, ProviderModelOverride>): ProviderModelOverride {
  return overrides[model.id] ?? {};
}

function valuesFor(current: number, presets: number[]): string[] {
  return ["auto", ...new Set([current, ...presets]).values()].map(String);
}

function effectiveReasoning(model: ProviderModelConfigLike, override: ProviderModelOverrideLayer): boolean {
  return typeof override.reasoning === "boolean" ? override.reasoning : model.reasoning;
}

function effectiveNumber(
  model: ProviderModelConfigLike,
  override: ProviderModelOverrideLayer,
  field: "contextWindow" | "maxTokens",
): number {
  return typeof override[field] === "number" ? override[field] : model[field];
}

function strictModeLabel(model: ProviderModelConfigLike): string {
  const strict = (model.compat as { supportsStrictMode?: boolean } | undefined)?.supportsStrictMode;
  return strict === false ? "disabled" : strict === true ? "enabled" : "auto";
}

function formattedOtherCompat(model: ProviderModelConfigLike): string {
  const entries = Object.entries(model.compat ?? {}).filter(([key]) => key !== "supportsStrictMode");
  return entries.length === 0 ? "none" : entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

function detailItems(model: ProviderModelConfigLike, override: ProviderModelOverrideLayer): SettingItem[] {
  const reasoning = effectiveReasoning(model, override);
  const contextWindow = effectiveNumber(model, override, "contextWindow");
  const maxTokens = effectiveNumber(model, override, "maxTokens");
  return [
    {
      id: "reasoning",
      label: "Reasoning",
      description: `Effective: ${reasoning ? "on" : "off"}. ${override.reasoning === undefined ? "Metadata/capability default." : "User override."}`,
      currentValue: typeof override.reasoning !== "boolean" ? "auto" : override.reasoning ? "on" : "off",
      values: ["auto", "on", "off"],
    },
    {
      id: "contextWindow",
      label: "Context window",
      description: `Effective: ${contextWindow} tokens. ${override.contextWindow === undefined ? "Derived default." : "User override."}`,
      currentValue: typeof override.contextWindow !== "number" ? "auto" : String(override.contextWindow),
      values: valuesFor(contextWindow, [...CONTEXT_WINDOW_PRESETS]),
    },
    {
      id: "maxTokens",
      label: "Max output tokens",
      description: `Effective: ${maxTokens} tokens. ${override.maxTokens === undefined ? "Derived default." : "User override."}`,
      currentValue: typeof override.maxTokens !== "number" ? "auto" : String(override.maxTokens),
      values: valuesFor(maxTokens, [...MAX_TOKEN_PRESETS]),
    },
  ];
}

function details(model: ProviderModelConfigLike): string[] {
  return [
    `Name: ${model.name}`,
    `API: ${model.api ?? "openai-completions (provider default)"}`,
    `Input: ${model.input.join(", ")}`,
    `Cost: in ${model.cost.input}, out ${model.cost.output}, cache read ${model.cost.cacheRead}, cache write ${model.cost.cacheWrite}`,
    `Thinking map: ${model.thinkingLevelMap ? Object.keys(model.thinkingLevelMap).join(", ") : "none"}`,
    `Other compat: ${formattedOtherCompat(model)}`,
  ];
}

function modelSelectorItems(
  models: ProviderModelConfigLike[],
  overrides: Record<string, ProviderModelOverride>,
  showStrictMode: boolean,
): SelectItem[] {
  const sorted = [...models].sort((left, right) => left.id.localeCompare(right.id));
  const idWidth = Math.max(...sorted.map((model) => visibleWidth(model.id)));
  const apiWidth = Math.max(...sorted.map((model) => visibleWidth(model.api ?? "completions")));
  const modeWidth = Math.max(...sorted.map((model) => visibleWidth(model.reasoning ? "reasoning" : "standard")));
  const strictWidth = showStrictMode
    ? Math.max(...sorted.map((model) => visibleWidth(strictModeLabel(model))))
    : 0;
  const contextWidth = Math.max(...sorted.map((model) => String(model.contextWindow).length));
  const pad = (value: string, width: number) => `${value}${" ".repeat(Math.max(0, width - visibleWidth(value)))}`;

  return sorted.map((model) => {
    const override = modelOverride(model, overrides);
    const overrideLabel = Object.keys(override).length > 0 ? " override" : "";
    const api = model.api ?? "completions";
    const mode = model.reasoning ? "reasoning" : "standard";
    const strict = strictModeLabel(model);
    const context = String(model.contextWindow).padStart(contextWidth);
    return {
      value: model.id,
      label: pad(model.id, idWidth),
      description: [
        pad(api, apiWidth),
        pad(mode, modeWidth),
        ...(showStrictMode ? [`${pad(strict, strictWidth)} strict`] : []),
        `${context} ctx${overrideLabel}`,
      ].join("  "),
    };
  });
}

type ConfigTab = "Connection" | "Models" | "Display";

const CONFIG_TABS: ConfigTab[] = ["Connection", "Models", "Display"];

function providerSettingsItems(
  tab: ConfigTab,
  settings: ProviderSettings,
  connection: CpaProviderConfig,
): SettingItem[] {
  if (tab === "Connection") {
    return [{
      id: "connection",
      label: "Endpoint and authentication",
      description: `${connection.providerName}  ${connection.baseUrl}  ${connection.authRequired ? "credentials required" : "no credentials"}`,
      currentValue: "open",
      values: ["open", "edit"],
    }];
  }
  if (tab === "Models") return [
    {
      id: "gpt56ContextWindow",
      label: "GPT-5.6 context window",
      description: "canonical advertises 272000 tokens; full uses the models.dev limit.",
      currentValue: settings.gpt56ContextWindow,
      values: ["canonical", "full"],
    },
  ];
  return [
    {
      id: "showStrictMode",
      label: "Show strict tool schema",
      description: "Show the published strict-schema compatibility value in the model selector.",
      currentValue: settings.showStrictMode ? "enabled" : "disabled",
      values: ["disabled", "enabled"],
    },
  ];
}

function nextTab(tab: ConfigTab, direction: 1 | -1): ConfigTab {
  const index = CONFIG_TABS.indexOf(tab);
  return CONFIG_TABS[(index + direction + CONFIG_TABS.length) % CONFIG_TABS.length] ?? "Connection";
}

export async function openProviderConfig(
  ctx: ExtensionCommandContext,
  settings: ProviderSettings,
  connection: CpaProviderConfig,
): Promise<"connection" | undefined> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/cliproxyapi config requires interactive TUI mode.", "warning");
    return;
  }

  const edited: ProviderSettings = { ...settings };
  const action = await ctx.ui.custom<"connection" | undefined>((tui, theme, _keybindings, done) => {
    let activeTab: ConfigTab = "Connection";
    let list: SettingsList;
    const makeList = () => new SettingsList(
      providerSettingsItems(activeTab, edited, connection),
      8,
      getSettingsListTheme(),
      (id, value) => {
        if (id === "connection" && value === "edit") {
          done("connection");
          return;
        }
        if (id === "gpt56ContextWindow" && (value === "canonical" || value === "full")) {
          edited.gpt56ContextWindow = value;
        }
        if (id === "showStrictMode" && (value === "enabled" || value === "disabled")) {
          edited.showStrictMode = value === "enabled";
        }
        list.updateValue(id, value);
        tui.requestRender();
      },
      () => done(undefined),
      { enableSearch: true },
    );
    list = makeList();
    return {
      render: (width) => {
        const border = theme.fg("border", "─".repeat(Math.max(0, width)));
        const tabs = CONFIG_TABS.map((tab) => tab === activeTab
          ? theme.fg("accent", theme.bold(tab))
          : theme.fg("muted", tab));
        return [
          border,
          `  ${tabs.join(theme.fg("muted", " / "))}`,
          border,
          ...list.render(width),
          theme.fg("dim", "  Enter/Space changes  Tab switches sections  Esc saves and reloads Pi"),
          border,
        ].map((line) => truncateToWidth(line, width, ""));
      },
      invalidate: () => list.invalidate(),
      handleInput: (data) => {
        if (matchesKey(data, Key.tab)) {
          activeTab = nextTab(activeTab, 1);
          list = makeList();
          tui.requestRender();
          return;
        }
        if (matchesKey(data, Key.shift("tab"))) {
          activeTab = nextTab(activeTab, -1);
          list = makeList();
          tui.requestRender();
          return;
        }
        list.handleInput(data);
      },
    };
  });

  if (action === "connection") return action;
  if (JSON.stringify(settings) === JSON.stringify(edited)) return;
  try {
    const path = saveProviderSettings(ctx.cwd, edited);
    ctx.ui.notify(`Saved CLIProxyAPI configuration to ${path}. Reloading Pi...`, "info");
    await ctx.reload();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Could not save CLIProxyAPI configuration: ${message}`, "error");
  }
}

export async function openModelInspector(
  ctx: ExtensionCommandContext,
  catalog: ProviderCatalog,
  overrides: Record<string, ProviderModelOverride>,
  showStrictMode: boolean,
): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/cliproxyapi models requires interactive TUI mode.", "warning");
    return;
  }

  const snapshot = catalog.current() ?? await catalog.load();
  const models = normalizeProviderModels(snapshot.built.models);
  if (models.length === 0) {
    ctx.ui.notify("No available models in the current CLIProxyAPI snapshot. Run /cliproxyapi refresh models first.", "warning");
    return;
  }

  const selectedId = await ctx.ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text) => theme.fg("border", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold("CLIProxyAPI models")), 1, 0));
    container.addChild(new Text(theme.fg("muted", "Select a model to inspect or override bounded limits."), 1, 0));
    const list = new SelectList(modelSelectorItems(models, overrides, showStrictMode), Math.min(models.length, 12), {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text),
    });
    list.onSelect = (item) => done(item.value);
    list.onCancel = () => done(undefined);
    container.addChild(list);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate  Enter inspect  Esc close"), 1, 0));
    container.addChild(new DynamicBorder((text) => theme.fg("border", text)));
    return {
      render: (width) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data) => { list.handleInput(data); tui.requestRender(); },
    };
  });
  if (!selectedId) return;

  const model = models.find((candidate) => candidate.id === selectedId);
  if (!model) return;
  const layers = loadModelOverrideLayers(ctx.cwd);
  const globalOverride = layers.global[model.id] ?? {};
  const original: ProviderModelOverrideLayer = layers.project[model.id] ?? {};
  const edited: ProviderModelOverrideLayer = { ...original };
  const selectAuto = (field: keyof ProviderModelOverrideLayer) => {
    if (globalOverride[field] === undefined) delete edited[field];
    else edited[field] = null;
  };

  await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((text) => theme.fg("border", text)));
    container.addChild(new Text(theme.fg("accent", theme.bold(model.id)), 1, 0));
    container.addChild(new Text(theme.fg("accent", `Strict tool schema: ${strictModeLabel(model)}`), 1, 0));
    for (const line of details(model)) container.addChild(new Text(theme.fg("muted", line), 1, 0));

    const onChange = (id: string, value: string) => {
      if (id === "reasoning") {
        if (value === "auto") selectAuto("reasoning");
        else edited.reasoning = value === "on";
      }
      if (id === "contextWindow") {
        if (value === "auto") selectAuto("contextWindow");
        else edited.contextWindow = Number(value);
      }
      if (id === "maxTokens") {
        if (value === "auto") selectAuto("maxTokens");
        else edited.maxTokens = Number(value);
      }
      list.updateValue(id, value);
      tui.requestRender();
    };
    const list = new SettingsList(
      detailItems(model, edited),
      8,
      getSettingsListTheme(),
      onChange,
      () => done(undefined),
      { enableSearch: true },
    );
    container.addChild(list);
    container.addChild(new Text(theme.fg("dim", "Enter/Space changes  Esc saves and reloads Pi"), 1, 0));
    container.addChild(new DynamicBorder((text) => theme.fg("border", text)));
    return {
      render: (width) => container.render(width),
      invalidate: () => { container.invalidate(); list.invalidate(); },
      handleInput: (data) => list.handleInput(data),
    };
  });

  if (JSON.stringify(original) === JSON.stringify(edited)) return;
  try {
    const saved = saveModelOverride(ctx.cwd, model.id, edited);
    ctx.ui.notify(`Saved overrides for ${model.id} to ${saved.path}. Reloading Pi...`, "info");
    await ctx.reload();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Could not save model overrides: ${message}`, "error");
  }
}
