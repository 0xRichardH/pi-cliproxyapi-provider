import { AuthStorage } from "@earendil-works/pi-coding-agent";

export async function getDiscoveryApiKey(providerName: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  try {
    const stored = await AuthStorage.create().getApiKey(providerName, { includeFallback: false });
    return stored ?? env.CLIPROXYAPI_API_KEY;
  } catch {
    return env.CLIPROXYAPI_API_KEY;
  }
}
