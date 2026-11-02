import type { ProviderModelConfigLike } from "./types.ts";

export interface ModelApiContext {
  availableModelId: string;
  metadataModelId?: string;
}

const GPT_5_3_CODEX_MODEL = /^gpt-5\.3-codex(?:-|$)/;
const GPT_5_3_CODEX_SPARK_MODEL = /^gpt-5\.3-codex-spark$/;
const GPT_5_4_PLUS_MODEL = /^gpt-5\.[4-9](?:\.\d+)?(?:-|$)/;
const GPT_5_4_MODEL = /^gpt-5\.4$/;
const GPT_5_4_OR_GPT_5_5_MODEL = /^gpt-5\.[45](?:-|$)/;
const GPT_5_5_MODEL = /^gpt-5\.5$/;
const PRO_MODEL = /-pro$/;
const GPT_5_6_CYBER_MODEL = /^gpt-5\.6-cyber$/;
const GPT_5_6_MODEL = /^gpt-5\.6(?:-|$)/;
const GPT_6_1_MODEL = /^gpt-6\.1(?:-|$)/;
const GPT_6_MODEL = /^gpt-6(?:\.\d+)?(?:-|$)/;
const CLAUDE_MODEL = /^claude(?:-|$)/;

/**
 * Pi's conservative context windows for the Codex Responses families, taken
 * from its native `openai` and `openai-codex` catalogs. models.dev advertises
 * up to 1050000 for most of them, but a CLIProxyAPI route only allows that
 * when its `max-context-length` override is set, so the
 * `gpt56ContextWindow` setting must opt in explicitly.
 */
const CODEX_CONTEXT_WINDOWS: ReadonlyArray<{ pattern: RegExp; contextWindow: number }> = [
  { pattern: GPT_5_3_CODEX_SPARK_MODEL, contextWindow: 128000 },
  { pattern: GPT_5_4_MODEL, contextWindow: 272000 },
  { pattern: GPT_5_5_MODEL, contextWindow: 272000 },
  { pattern: GPT_5_6_CYBER_MODEL, contextWindow: 400000 },
  { pattern: GPT_5_6_MODEL, contextWindow: 272000 },
  { pattern: GPT_6_1_MODEL, contextWindow: 500000 },
  { pattern: GPT_6_MODEL, contextWindow: 272000 },
];

function modelName(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

function matchesModelId(context: ModelApiContext, pattern: RegExp): boolean {
  const ids = [context.availableModelId, context.metadataModelId].filter((id): id is string => id !== undefined);
  return ids.some((id) => pattern.test(modelName(id)));
}

export function isGpt53CodexModel(context: ModelApiContext): boolean {
  return matchesModelId(context, GPT_5_3_CODEX_MODEL);
}

export function isGpt53CodexSparkModel(context: ModelApiContext): boolean {
  return matchesModelId(context, GPT_5_3_CODEX_SPARK_MODEL);
}

export function isGpt54OrGpt55Model(context: ModelApiContext): boolean {
  return matchesModelId(context, GPT_5_4_OR_GPT_5_5_MODEL);
}

export function isProModel(context: ModelApiContext): boolean {
  return matchesModelId(context, PRO_MODEL);
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
 * Responses-only upstream and the same usage shape. The Codex-served base
 * models use a conservative 272000 context window unless the CPA route is
 * known to allow more.
 */
export function isCodexResponsesModel(context: ModelApiContext): boolean {
  return isGpt53CodexModel(context)
    || matchesModelId(context, GPT_5_4_PLUS_MODEL)
    || isGpt6Model(context);
}

export function codexContextWindow(context: ModelApiContext): number | undefined {
  for (const id of [context.availableModelId, context.metadataModelId]) {
    if (id === undefined) continue;
    const name = modelName(id);
    const entry = CODEX_CONTEXT_WINDOWS.find((candidate) => candidate.pattern.test(name));
    if (entry !== undefined) return entry.contextWindow;
  }
  return undefined;
}

export function isClaudeModel(context: ModelApiContext): boolean {
  return matchesModelId(context, CLAUDE_MODEL);
}

/**
 * Select a model-level API when a mixed CLIProxyAPI catalog cannot share the
 * provider default.
 *
 * - Codex GPT models (`gpt-5.3-codex`, `gpt-5.4` and later, `gpt-6-astra`)
 *   use the Responses API so Pi receives the Responses usage shape needed for
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
