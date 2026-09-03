import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.ts";
import { ProviderCatalog } from "../src/catalog.ts";
import { ProviderRuntime } from "../src/runtime.ts";
import { buildProviderRegistration } from "../src/registration.ts";
import { buildUnavailableProviderModels } from "../src/provider.ts";
import { registerCliproxyapiCommand } from "../src/commands.ts";
import { getDiscoveryApiKey } from "../src/auth.ts";
import { loadProviderSettings } from "../src/settings.ts";
import { registerCodexCompatiblePayloadAdapter } from "../src/codex-compat.ts";
import { formatGatewayTokensPerSecond, tokensPerSecondFromUsage } from "../src/gateway-telemetry.ts";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(extensionDir);
const bundledModelsDevPath = join(packageRoot, "data", "models-dev-fallback.json");

export default async function (pi: ExtensionAPI) {
  let config = DEFAULT_CONFIG;
  try {
    const cwd = process.cwd();
    config = loadConfig(cwd);
    const settings = loadProviderSettings(cwd);
    const catalog = new ProviderCatalog({
      config,
      gpt56ContextWindow: settings.gpt56ContextWindow,
      bundledModelsDevPath,
      getApiKey: () => getDiscoveryApiKey(config.providerName),
    });
    const runtime = new ProviderRuntime({ pi, config, catalog });
    registerCodexCompatiblePayloadAdapter(pi, config.providerName);
    registerCliproxyapiCommand(pi, runtime, catalog);
    registerGatewayTelemetry(pi);
    await runtime.start();
  } catch (error) {
    registerCodexCompatiblePayloadAdapter(pi, config.providerName);
    registerCliproxyapiCommand(pi);
    pi.registerProvider(config.providerName, buildProviderRegistration(config, buildUnavailableProviderModels()).config);
    console.warn(`[pi-cliproxyapi-provider] registered placeholder provider after startup failure: ${error instanceof Error ? error.message : String(error)}`);
  }
}


export function registerGatewayTelemetry(pi: ExtensionAPI): void {
  const usages: unknown[] = [];
  pi.on("agent_end", (event: { messages?: Array<{ usage?: unknown }> }) => {
    for (const message of event.messages ?? []) {
      if (tokensPerSecondFromUsage(message.usage) !== undefined) usages.push(message.usage);
    }
  });
  pi.on("agent_settled", (_event: unknown, ctx: { ui?: { notify?: (message: string, type?: string) => void } }) => {
    const tps = formatGatewayTokensPerSecond(usages);
    usages.length = 0;
    ctx.ui?.notify?.(`TPS ${tps} tok/s`, "info");
  });
}
