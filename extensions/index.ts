import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.ts";
import { discoverModels } from "../src/discovery.ts";
import { buildProviderModels, buildUnavailableProviderModels } from "../src/provider.ts";
import { buildProviderRegistration } from "../src/registration.ts";
import { registerCliproxyapiCommand } from "../src/commands.ts";
import { getDiscoveryApiKey } from "../src/auth.ts";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(extensionDir);
const bundledModelsDevPath = join(packageRoot, "data", "models-dev-fallback.json");

export default async function (pi: ExtensionAPI) {
  registerCliproxyapiCommand(pi, bundledModelsDevPath);

  let config = DEFAULT_CONFIG;
  try {
    config = loadConfig(process.cwd());
    const discovery = await discoverModels({ config, bundledModelsDevPath, discoveryApiKey: await getDiscoveryApiKey(config.providerName) });
    const built = buildProviderModels(discovery.cpaModels, discovery.modelsDevCatalog, config.modelAliases);
    const registration = buildProviderRegistration(config, built.models);
    pi.registerProvider(registration.providerName, registration.config);
  } catch (error) {
    pi.registerProvider(config.providerName, buildProviderRegistration(config, buildUnavailableProviderModels()).config);
    console.warn(`[pi-cliproxyapi-provider] registered placeholder provider after discovery failure: ${error instanceof Error ? error.message : String(error)}`);
  }
}
