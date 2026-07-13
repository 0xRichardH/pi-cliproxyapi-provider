import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG, loadConfig, globalConfigPath, readConfigFile, writeConfigFile, type ConfigLayer } from "./config.ts";
import type { ProviderCatalog, CatalogSnapshot, RefreshTarget, SourceRefreshResult } from "./catalog.ts";
import type { ProviderRuntime } from "./runtime.ts";

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
    `If you just ran /login ${config.providerName}, run /cliproxyapi refresh models.`,
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

function age(timestamp?: number): string {
  if (timestamp === undefined) return "missing";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

function capabilityCount(snapshot: CatalogSnapshot, key: "reasoning" | "image"): number {
  return snapshot.built.models.filter((model) => key === "reasoning" ? model.reasoning : model.input.includes("image")).length;
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

  if (existing) ctx.ui.notify(`Editing existing global config at ${path}:\n${JSON.stringify(redactConfig(existing), null, 2)}`, "info");

  const providerNameInput = await ctx.ui.input(`Provider name (leave blank to keep: ${defaults.providerName})`, `leave blank to keep ${defaults.providerName}`);
  if (providerNameInput === undefined) return;
  const baseUrlInput = await ctx.ui.input(`CLIProxyAPI base URL (leave blank to keep: ${defaults.baseUrl})`, `leave blank to keep ${defaults.baseUrl}`);
  if (baseUrlInput === undefined) return;
  const authRequired = await ctx.ui.confirm(
    `Require /login credentials? (current: ${defaults.authRequired ? "yes" : "no"})`,
    "Choose yes unless this CLIProxyAPI instance accepts unauthenticated requests.",
  );
  const authHeader = authRequired
    ? await ctx.ui.confirm(
        `Send Authorization bearer header? (current: ${defaults.authHeader ? "yes" : "no"})`,
        "Choose yes for CLIProxyAPI API keys.",
      )
    : false;

  writeConfigFile(path, {
    providerName: providerNameInput || defaults.providerName,
    baseUrl: baseUrlInput || defaults.baseUrl,
    authRequired,
    authHeader,
  });
  ctx.ui.notify(`Saved CLIProxyAPI config to ${path}. Reloading pi to apply connection changes...`, "info");
  await ctx.reload();
}

function statusText(config: ReturnType<typeof loadConfig>, snapshot: CatalogSnapshot): string {
  return [
    `CLIProxyAPI provider: ${config.providerName}`,
    `Base URL: ${config.baseUrl}`,
    `Auth required: ${config.authRequired ? "yes" : "no"}`,
    `Models: ${snapshot.built.stats.total} (${snapshot.built.stats.enriched} enriched, ${snapshot.built.stats.unmatched} unmatched)`,
    `Reasoning models: ${capabilityCount(snapshot, "reasoning")}`,
    `Image-capable models: ${capabilityCount(snapshot, "image")}`,
    `CPA snapshot: ${age(snapshot.cpaUpdatedAt)}`,
    `models.dev metadata: ${snapshot.metadataSource}${snapshot.metadataUpdatedAt ? `, ${age(snapshot.metadataUpdatedAt)}` : ""}`,
  ].join("\n");
}

function refreshPart(label: string, result: SourceRefreshResult): string {
  if (!result.attempted) return `${label}: not requested`;
  if (result.error) return `${label}: failed (${errorText(result.error)}); retained previous snapshot`;
  return `${label}: ${result.changed ? "updated" : "unchanged"}`;
}

function parseRefreshTarget(value: string | undefined): RefreshTarget | undefined {
  if (!value || value === "all") return "all";
  if (value === "models") return "models";
  if (value === "metadata") return "metadata";
  return undefined;
}

export function cliproxyapiArgumentCompletions(prefix: string): Array<{ value: string; label: string }> {
  return ["config", "status", "refresh", "refresh models", "refresh metadata", "aliases", "help"]
    .filter((item) => item.startsWith(prefix))
    .map((value) => ({ value, label: value }));
}

export function registerCliproxyapiCommand(pi: ExtensionAPI, runtime?: ProviderRuntime, catalog?: ProviderCatalog): void {
  pi.registerCommand("cliproxyapi", {
    description: "Configure, refresh, and inspect the CLIProxyAPI provider.",
    getArgumentCompletions(prefix) {
      return cliproxyapiArgumentCompletions(prefix);
    },
    async handler(args, ctx) {
      const [subcommand = "help", option] = args.trim().split(/\s+/);
      if (subcommand === "config") return runConfig(ctx);
      if (!runtime || !catalog) {
        ctx.ui.notify("CLIProxyAPI provider is unavailable. Run /cliproxyapi config and reload pi.", "error");
        return;
      }
      const config = loadConfig(ctx.cwd);
      if (subcommand === "status") {
        const snapshot = catalog.current() ?? await catalog.load();
        ctx.ui.notify(statusText(config, snapshot), "info");
        return;
      }
      if (subcommand === "refresh") {
        const target = parseRefreshTarget(option);
        if (!target) {
          ctx.ui.notify("Usage: /cliproxyapi refresh [models|metadata]", "warning");
          return;
        }
        const result = await runtime.refresh(target, "manual");
        const level = result.models.error || result.metadata.error ? "warning" : "info";
        ctx.ui.notify([
          "CLIProxyAPI provider refresh complete.",
          refreshPart("CPA models", result.models),
          refreshPart("models.dev metadata", result.metadata),
          `Registered: ${result.snapshot.built.stats.total} models, ${result.snapshot.built.stats.enriched} enriched, ${result.snapshot.built.stats.unmatched} unmatched.`,
        ].join("\n"), level);
        return;
      }
      if (subcommand === "aliases") {
        const snapshot = catalog.current() ?? await catalog.load();
        const sample = snapshot.built.stats.unmatchedModelIds.slice(0, 30);
        const body = sample.length === 0
          ? "All CPA models matched models.dev metadata."
          : `Unmatched CPA models (${snapshot.built.stats.unmatched}):\n${sample.map((id) => `  "${id}": "<models.dev-id>"`).join("\n")}`;
        ctx.ui.notify(body, snapshot.built.stats.unmatched ? "warning" : "info");
        return;
      }
      ctx.ui.notify("Usage: /cliproxyapi config|status|refresh [models|metadata]|aliases", "info");
    },
  });
}
