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
import { registerGatewayTelemetry } from "../src/gateway-telemetry.ts";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(extensionDir);
const bundledModelsDevPath = join(packageRoot, "data", "models-dev-fallback.json");

export default async function (pi: ExtensionAPI) {
  let config = DEFAULT_CONFIG;
  let runtime: ProviderRuntime | undefined;
  let catalog: ProviderCatalog | undefined;
  try {
    const cwd = process.cwd();
    config = loadConfig(cwd);
    const settings = loadProviderSettings(cwd);
    const nextCatalog = new ProviderCatalog({
      config,
      gpt56ContextWindow: settings.gpt56ContextWindow,
      bundledModelsDevPath,
      getApiKey: () => getDiscoveryApiKey(config.providerName),
    });
    const nextRuntime = new ProviderRuntime({ pi, config, catalog: nextCatalog });
    await nextRuntime.start();
    catalog = nextCatalog;
    runtime = nextRuntime;
  } catch (error) {
    pi.registerProvider(config.providerName, buildProviderRegistration(config, buildUnavailableProviderModels()).config);
    console.warn(`[pi-cliproxyapi-provider] registered placeholder provider after startup failure: ${error instanceof Error ? error.message : String(error)}`);
  }
  registerCodexCompatiblePayloadAdapter(pi, config.providerName);
  registerCliproxyapiCommand(pi, runtime, catalog);
  registerGatewayTelemetry(pi as never);
}


export { registerGatewayTelemetry } from "../src/gateway-telemetry.ts";
