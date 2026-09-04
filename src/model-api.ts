import type { ProviderModelConfigLike } from "./types.ts";

export interface ModelApiContext {
  availableModelId: string;
  metadataModelId?: string;
}

const GPT_5_6_MODEL = /^gpt-5\.6(?:-|$)/;
const CLAUDE_MODEL = /^claude(?:-|$)/;

function modelName(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

function matchesModelId(context: ModelApiContext, pattern: RegExp): boolean {
  const ids = [context.availableModelId, context.metadataModelId].filter((id): id is string => id !== undefined);
  return ids.some((id) => pattern.test(modelName(id)));
}

export function isGpt56Model(context: ModelApiContext): boolean {
  return matchesModelId(context, GPT_5_6_MODEL);
}

export function isClaudeModel(context: ModelApiContext): boolean {
  return matchesModelId(context, CLAUDE_MODEL);
}

/**
 * Select a model-level API when a mixed CLIProxyAPI catalog cannot share the
 * provider default.
 *
 * - GPT-5.6, including Codex variants, uses the Responses API so Pi receives
 *   the Responses usage shape needed for token-cost accounting.
 * - Claude models use the Anthropic Messages API, which CLIProxyAPI serves
 *   faithfully at `/v1/messages`. The Chat Completions shape cannot represent
 *   signed thinking blocks or per-turn thinking effort, so routing Claude
 *   through it drops signatures and breaks multi-turn reasoning replay.
 */
export function getModelApiOverride(context: ModelApiContext): ProviderModelConfigLike["api"] | undefined {
  if (isGpt56Model(context)) return "openai-responses";
  if (isClaudeModel(context)) return "anthropic-messages";
  return undefined;
}
