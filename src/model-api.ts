import type { ProviderModelConfigLike } from "./types.ts";

export interface ModelApiContext {
  availableModelId: string;
  metadataModelId?: string;
}

const GPT_5_6_MODEL = /^gpt-5\.6(?:-|$)/;
const GPT_6_MODEL = /^gpt-6(?:\.\d+)?(?:-|$)/;
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

/** GPT-6 family (`gpt-6-astra`, and any `gpt-6.x-*` successor). */
export function isGpt6Model(context: ModelApiContext): boolean {
  return matchesModelId(context, GPT_6_MODEL);
}

/**
 * The Codex Responses family: every GPT model CLIProxyAPI serves from a Codex
 * OAuth credential rather than a plain OpenAI API key. They share the same
 * Responses-only upstream, the same usage shape, and the same conservative
 * 272000 context window unless the CPA route is known to allow more.
 */
export function isCodexResponsesModel(context: ModelApiContext): boolean {
  return isGpt56Model(context) || isGpt6Model(context);
}

export function isClaudeModel(context: ModelApiContext): boolean {
  return matchesModelId(context, CLAUDE_MODEL);
}

/**
 * Select a model-level API when a mixed CLIProxyAPI catalog cannot share the
 * provider default.
 *
 * - GPT-5.6 (including Codex variants) and GPT-6 (`gpt-6-astra`) use the
 *   Responses API so Pi receives the Responses usage shape needed for
 *   token-cost accounting. CLIProxyAPI serves these from Codex OAuth
 *   credentials, whose upstream is Responses-only.
 * - Claude models use the Anthropic Messages API, which CLIProxyAPI serves
 *   faithfully at `/v1/messages`. The Chat Completions shape cannot represent
 *   signed thinking blocks or per-turn thinking effort, so routing Claude
 *   through it drops signatures and breaks multi-turn reasoning replay.
 */
export function getModelApiOverride(context: ModelApiContext): ProviderModelConfigLike["api"] | undefined {
  if (isCodexResponsesModel(context)) return "openai-responses";
  if (isClaudeModel(context)) return "anthropic-messages";
  return undefined;
}
