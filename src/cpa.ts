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

export function parseCpaModelsResponse(payload: unknown): CpaModel[] {
  const response = payload as CpaModelsResponse;
  if (!response || typeof response !== "object" || !Array.isArray(response.data)) {
    throw new Error("CPA /v1/models response must contain a data array");
  }

  return response.data.flatMap((entry) => {
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
}

export async function fetchCpaModels(baseUrl: string, headers: Record<string, string> = {}, timeoutMs?: number): Promise<CpaModel[]> {
  return withNetworkTimeout(async (signal) => {
    const response = await fetch(modelsEndpoint(baseUrl), {
      headers: { Accept: "application/json", ...headers },
      signal,
    });
    if (!response.ok) {
      throw new Error(`CPA model discovery failed: HTTP ${response.status} ${response.statusText}`);
    }
    return parseCpaModelsResponse(await response.json());
  }, timeoutMs, "CPA model discovery");
}
