import type { ProviderModelConfigLike } from "./types.ts";

export interface ModelApiContext {
  availableModelId: string;
  metadataModelId?: string;
}

const GPT_5_6_MODEL = /^gpt-5\.6(?:-|$)/;

function modelName(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

export function isGpt56Model(context: ModelApiContext): boolean {
  const ids = [context.availableModelId, context.metadataModelId].filter((id): id is string => id !== undefined);
  return ids.some((id) => GPT_5_6_MODEL.test(modelName(id)));
}

/**
 * Select a model-level API when a mixed CLIProxyAPI catalog cannot share the
 * provider default. GPT-5.6, including Codex variants, uses the Responses API
 * so Pi receives the Responses usage shape needed for token-cost accounting.
 */
export function getModelApiOverride(context: ModelApiContext): ProviderModelConfigLike["api"] | undefined {
  return isGpt56Model(context) ? "openai-responses" : undefined;
}
