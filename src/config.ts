import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { CpaProviderConfig } from "./types.ts";

export type ConfigLayer = Partial<CpaProviderConfig>;

export const DEFAULT_CONFIG: CpaProviderConfig = {
  providerName: "cpa",
  baseUrl: "http://localhost:8317/v1",
  authRequired: true,
  authHeader: true,
  headers: {},
  cpaCacheTtlSeconds: 60 * 60,
  modelsDevCacheTtlSeconds: 24 * 60 * 60,
  modelsDevEnabled: true,
  modelAliases: {},
};

export function globalConfigPath(): string {
  return join(homedir(), ".pi", "agent", "pi-cliproxyapi-provider", "config.json");
}

export function projectConfigPath(cwd: string): string {
  return join(cwd, ".pi", "pi-cliproxyapi-provider", "config.json");
}

export function cacheDir(): string {
  return join(homedir(), ".cache", "pi-cliproxyapi-provider");
}

export function providerCacheKey(config: Pick<CpaProviderConfig, "providerName" | "baseUrl">): string {
  return Buffer.from(`${config.providerName}\n${config.baseUrl}`).toString("base64url");
}

export function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function mergeLayer(base: CpaProviderConfig, layer?: ConfigLayer): CpaProviderConfig {
  if (!layer) return base;
  return {
    ...base,
    ...layer,
    headers: { ...base.headers, ...(layer.headers ?? {}) },
    modelAliases: { ...base.modelAliases, ...(layer.modelAliases ?? {}) },
  };
}

function envLayer(env: NodeJS.ProcessEnv): ConfigLayer {
  const authRequired = parseBooleanEnv(env.CLIPROXYAPI_AUTH_REQUIRED);
  const authHeader = parseBooleanEnv(env.CLIPROXYAPI_AUTH_HEADER);
  const modelsDevEnabled = parseBooleanEnv(env.CLIPROXYAPI_MODELS_DEV_ENABLED);
  return {
    ...(env.CLIPROXYAPI_BASE_URL ? { baseUrl: env.CLIPROXYAPI_BASE_URL } : {}),
    ...(env.CLIPROXYAPI_PROVIDER_NAME ? { providerName: env.CLIPROXYAPI_PROVIDER_NAME } : {}),
    ...(authRequired !== undefined ? { authRequired } : {}),
    ...(authHeader !== undefined ? { authHeader } : {}),
    ...(modelsDevEnabled !== undefined ? { modelsDevEnabled } : {}),
  };
}

export function mergeConfigLayers(
  globalConfig?: ConfigLayer,
  projectConfig?: ConfigLayer,
  env: NodeJS.ProcessEnv = process.env,
): CpaProviderConfig {
  return mergeLayer(mergeLayer(mergeLayer(DEFAULT_CONFIG, globalConfig), projectConfig), envLayer(env));
}

export function readConfigFile(path: string): ConfigLayer | undefined {
  if (!existsSync(path)) return undefined;
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Config file must contain a JSON object: ${path}`);
  }
  return parsed as ConfigLayer;
}

export function loadConfig(cwd: string, env: NodeJS.ProcessEnv = process.env): CpaProviderConfig {
  return mergeConfigLayers(readConfigFile(globalConfigPath()), readConfigFile(projectConfigPath(cwd)), env);
}

export function writeConfigFile(path: string, config: ConfigLayer): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}
