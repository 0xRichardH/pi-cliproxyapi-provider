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

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(extensionDir);
const bundledModelsDevPath = join(packageRoot, "data", "models-dev-fallback.json");

export default async function (pi: ExtensionAPI) {
  let config = DEFAULT_CONFIG;
  try {
    config = loadConfig(process.cwd());
    const catalog = new ProviderCatalog({
      config,
      bundledModelsDevPath,
      getApiKey: () => getDiscoveryApiKey(config.providerName),
    });
    const runtime = new ProviderRuntime({ pi, config, catalog });
    registerCliproxyapiCommand(pi, runtime, catalog);
    await runtime.start();

    let backgroundRefreshStarted = false;
    pi.on("session_start", (event) => {
      if (event.reason !== "startup" || backgroundRefreshStarted) return;
      backgroundRefreshStarted = true;
      // Cached models are the normal startup path; refresh quietly in the background.
      void runtime.refresh("models", "background");
    });
  } catch (error) {
    registerCliproxyapiCommand(pi);
    pi.registerProvider(config.providerName, buildProviderRegistration(config, buildUnavailableProviderModels()).config);
    console.warn(`[pi-cliproxyapi-provider] registered placeholder provider after startup failure: ${error instanceof Error ? error.message : String(error)}`);
  }
}
