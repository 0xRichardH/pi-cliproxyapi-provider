import { withNetworkTimeout } from "./network.ts";

export interface CpaModel {
  id: string;
  object?: string;
  owned_by?: string;
  created?: number;
}

export interface CpaModelsResponse {
  object?: string;
  data?: unknown[];
}

export function modelsEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

function parseCpaModelEntries(entries: unknown[]): CpaModel[] {
  const models = entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.trim() === "") return [];
    return [{
      id: record.id,
      object: typeof record.object === "string" ? record.object : undefined,
      owned_by: typeof record.owned_by === "string" ? record.owned_by : undefined,
      created: typeof record.created === "number" ? record.created : undefined,
    }];
  });

  const unique = new Map<string, CpaModel>();
  for (const model of models) unique.set(model.id, model);
  return [...unique.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function parseCpaModelsCache(payload: unknown): CpaModel[] {
  if (!Array.isArray(payload)) throw new Error("CPA model snapshot must be an array");
  const models = parseCpaModelEntries(payload);
  if (models.length !== payload.length) throw new Error("CPA model snapshot contains invalid entries");
  return models;
}

export function parseCpaModelsResponse(payload: unknown): CpaModel[] {
  const response = payload as CpaModelsResponse;
  if (!response || typeof response !== "object" || !Array.isArray(response.data)) {
    throw new Error("CPA /v1/models response must contain a data array");
  }
  return parseCpaModelEntries(response.data);
}

export async function fetchCpaModels(
  baseUrl: string,
  headers: Record<string, string> = {},
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<CpaModel[]> {
  return withNetworkTimeout(async (reqSignal) => {
    const response = await fetch(modelsEndpoint(baseUrl), {
      headers: { Accept: "application/json", ...headers },
      signal: reqSignal,
    });
    if (!response.ok) {
      throw new Error(`CPA model discovery failed: HTTP ${response.status} ${response.statusText}`);
    }
    return parseCpaModelsResponse(await response.json());
  }, timeoutMs, "CPA model discovery", signal);
}
