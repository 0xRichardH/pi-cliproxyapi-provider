import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { existsSync, statSync } from "node:fs";
import { DEFAULT_CONFIG, loadConfig, globalConfigPath, readConfigFile, writeConfigFile, type ConfigLayer } from "./config.ts";
import { cpaModelsCachePath, discoverModels, modelsDevCachePath } from "./discovery.ts";
import { buildProviderModels } from "./provider.ts";
import { getDiscoveryApiKey } from "./auth.ts";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatStatusFailure(config: ReturnType<typeof loadConfig>, error: unknown): string {
  return [
    `CLIProxyAPI status failed: ${errorText(error)}`,
    `Provider: ${config.providerName}`,
    `Base URL: ${config.baseUrl}`,
    `Auth required: ${config.authRequired ? "yes" : "no"}`,
    "",
    "Run /cliproxyapi config to set the CLIProxyAPI base URL.",
    `If you changed config or just ran /login ${config.providerName}, run /reload before selecting models.`,
  ].join("\n");
}

function redactConfig(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactConfig);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    const isSecretLike = /authorization|api[-_]?key|token|secret|cookie/i.test(key);
    return [key, isSecretLike ? "<redacted>" : redactConfig(entry)];
  }));
}

function age(path: string): string {
  if (!existsSync(path)) return "missing";
  const seconds = Math.round((Date.now() - statSync(path).mtimeMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export async function runConfig(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify("/cliproxyapi config requires an interactive UI.", "warning");
    return;
  }

  let current = DEFAULT_CONFIG;
  try {
    current = loadConfig(ctx.cwd);
  } catch (error) {
    ctx.ui.notify(`Existing CLIProxyAPI config is invalid; using defaults for repair: ${errorText(error)}`, "warning");
  }

  const path = globalConfigPath();
  let existing: ConfigLayer | undefined;
  try {
    existing = readConfigFile(path);
  } catch (error) {
    ctx.ui.notify(`Existing global CLIProxyAPI config is invalid and will be replaced if you save: ${errorText(error)}`, "warning");
  }
  const defaults = existing ?? current;

  if (existing) {
    ctx.ui.notify(`Editing existing global config at ${path}:\n${JSON.stringify(redactConfig(existing), null, 2)}`, "info");
  }

  const providerNameInput = await ctx.ui.input(`Provider name (leave blank to keep: ${defaults.providerName})`, `leave blank to keep ${defaults.providerName}`);
  if (providerNameInput === undefined) return;
  const baseUrlInput = await ctx.ui.input(`CLIProxyAPI base URL (leave blank to keep: ${defaults.baseUrl})`, `leave blank to keep ${defaults.baseUrl}`);
  if (baseUrlInput === undefined) return;
  const authRequired = await ctx.ui.confirm(
    `Require /login credentials? (current: ${defaults.authRequired ? "yes" : "no"})`,
    "Choose yes unless this CLIProxyAPI instance accepts unauthenticated requests."
  );
  const authHeader = authRequired
    ? await ctx.ui.confirm(
        `Send Authorization bearer header? (current: ${defaults.authHeader ? "yes" : "no"})`,
        "Choose yes for CLIProxyAPI API keys."
      )
    : false;

  const config: ConfigLayer = {
    providerName: providerNameInput || defaults.providerName,
    baseUrl: baseUrlInput || defaults.baseUrl,
    authRequired,
    authHeader,
  };
  writeConfigFile(path, config);
  ctx.ui.notify(`Saved CLIProxyAPI config to ${path}. Reloading pi to apply it...`, "info");
  await ctx.reload();
}

async function runStatus(ctx: ExtensionCommandContext, bundledModelsDevPath: string): Promise<void> {
  const config = loadConfig(ctx.cwd);
  try {
    const discovery = await discoverModels({ config, bundledModelsDevPath, discoveryApiKey: await getDiscoveryApiKey(config.providerName) });
    const built = buildProviderModels(discovery.cpaModels, discovery.modelsDevCatalog, config.modelAliases);
    ctx.ui.notify([
      `CLIProxyAPI provider: ${config.providerName}`,
      `Base URL: ${config.baseUrl}`,
      `Auth required: ${config.authRequired ? "yes" : "no"}`,
      `CPA models: ${built.stats.total} (${built.stats.enriched} enriched, ${built.stats.unmatched} unmatched)`,
      `CPA cache: ${discovery.sources.cpa}, age ${age(cpaModelsCachePath(config))}`,
      `models.dev cache: ${discovery.sources.modelsDev}, age ${age(modelsDevCachePath())}`,
    ].join("\n"), "info");
  } catch (error) {
    ctx.ui.notify(formatStatusFailure(config, error), "error");
  }
}

async function runRefresh(ctx: ExtensionCommandContext, bundledModelsDevPath: string): Promise<void> {
  const config = loadConfig(ctx.cwd);
  try {
    const discovery = await discoverModels({ config, bundledModelsDevPath, force: true, discoveryApiKey: await getDiscoveryApiKey(config.providerName) });
    const built = buildProviderModels(discovery.cpaModels, discovery.modelsDevCatalog, config.modelAliases);
    ctx.ui.notify(`Refreshed CLIProxyAPI caches. ${built.stats.total} CPA models, ${built.stats.enriched} enriched, ${built.stats.unmatched} unmatched. Run /reload to load refreshed models.`, "info");
  } catch (error) {
    ctx.ui.notify(`CLIProxyAPI refresh failed: ${errorText(error)}`, "error");
  }
}

async function runAliases(ctx: ExtensionCommandContext, bundledModelsDevPath: string): Promise<void> {
  const config = loadConfig(ctx.cwd);
  try {
    const discovery = await discoverModels({ config, bundledModelsDevPath, discoveryApiKey: await getDiscoveryApiKey(config.providerName) });
    const built = buildProviderModels(discovery.cpaModels, discovery.modelsDevCatalog, config.modelAliases);
    const sample = built.stats.unmatchedModelIds.slice(0, 30);
    const body = sample.length === 0
      ? "All CPA models matched models.dev metadata."
      : `Unmatched CPA models (${built.stats.unmatched}):\n${sample.map((id) => `  "${id}": "<models.dev-id>"`).join("\n")}`;
    ctx.ui.notify(body, built.stats.unmatched ? "warning" : "info");
  } catch (error) {
    ctx.ui.notify(`CLIProxyAPI aliases failed: ${errorText(error)}`, "error");
  }
}

export function cliproxyapiArgumentCompletions(prefix: string): Array<{ value: string; label: string }> {
  return ["config", "status", "refresh", "aliases", "help"]
    .filter((item) => item.startsWith(prefix))
    .map((value) => ({ value, label: value }));
}

export function registerCliproxyapiCommand(pi: ExtensionAPI, bundledModelsDevPath: string): void {
  pi.registerCommand("cliproxyapi", {
    description: "Configure and inspect the CLIProxyAPI provider.",
    getArgumentCompletions(prefix) {
      return cliproxyapiArgumentCompletions(prefix);
    },
    async handler(args, ctx) {
      const subcommand = args.trim().split(/\s+/, 1)[0] || "help";
      if (subcommand === "config") return runConfig(ctx);
      if (subcommand === "status") return runStatus(ctx, bundledModelsDevPath);
      if (subcommand === "refresh") return runRefresh(ctx, bundledModelsDevPath);
      if (subcommand === "aliases") return runAliases(ctx, bundledModelsDevPath);
      ctx.ui.notify("Usage: /cliproxyapi config|status|refresh|aliases\nAfter config or refresh, run /reload.", "info");
    },
  });
}
