import type { ThinkingLevel, ThinkingLevelMap } from "@earendil-works/pi-ai";
import { isGpt6Model } from "./model-api.ts";
import type { ModelsDevMetadata } from "./types.ts";

export interface ModelCapabilityContext {
  availableModelId: string;
  metadataModelId?: string;
}

export interface ModelCapabilityOverrides {
  reasoning?: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
}

interface ModelCapabilityRule {
  matches: (context: ModelCapabilityContext) => boolean;
  overrides: ModelCapabilityOverrides;
}

const GPT_5_6_THINKING_LEVEL_MAP: ThinkingLevelMap = {
  off: "none",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

/**
 * GPT-6 Astra cannot switch reasoning off (its catalog entry lists only
 * low..max plus an `ultra` level pi has no slot for), and it has no `minimal`
 * effort: the lowest it accepts is `low`, so pi's `minimal` maps down to it.
 * Mirrors pi's native `openai-codex/gpt-6-astra` definition.
 */
const GPT_6_THINKING_LEVEL_MAP: ThinkingLevelMap = {
  off: null,
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

function includesModelFamily(context: ModelCapabilityContext, family: string): boolean {
  return [context.availableModelId, context.metadataModelId]
    .filter((id): id is string => id !== undefined)
    .some((id) => id.includes(family));
}

const MODEL_CAPABILITY_RULES: readonly ModelCapabilityRule[] = [
  {
    matches: (context) => includesModelFamily(context, "gpt-5.6"),
    overrides: {
      reasoning: true,
      thinkingLevelMap: GPT_5_6_THINKING_LEVEL_MAP,
    },
  },
  {
    matches: (context) => isGpt6Model(context),
    overrides: {
      reasoning: true,
      thinkingLevelMap: GPT_6_THINKING_LEVEL_MAP,
    },
  },
];

/**
 * Pi's non-`off` thinking levels in rank order. Each is also the literal effort
 * name Anthropic and OpenAI accept, so a models.dev `effort` list can be read
 * directly against it.
 */
const PI_EFFORT_LEVELS: readonly ThinkingLevel[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/**
 * Derive a thinking map from models.dev `reasoning_options`.
 *
 * Pi treats an omitted map as "standard levels through `high`, no `xhigh` or
 * `max`", so a model that accepts those efforts (Claude Fable 5.x, Opus 4.7+,
 * Sonnet 5, GPT-5.6) silently loses its top levels unless something publishes
 * them. CLIProxyAPI's `/v1/models` does not, but the models.dev catalog the
 * extension already fetches lists the exact effort names each model accepts.
 *
 * Only the `effort` option contributes. Each pi level named in it maps to
 * itself; every other level maps to `null`, which is how pi represents holes
 * (Opus 4.6 accepts `max` but not `xhigh`). A `none` effort maps to `off`.
 * When `effort` is the *only* option, thinking cannot be disabled at all (Claude
 * Fable 5.x rejects `thinking.type = disabled`), so `off` becomes `null`; a
 * `toggle` or `budget_tokens` sibling means the model also has a switchable
 * mode, and `off` stays available. Models that only expose `budget_tokens`
 * return `undefined` so pi keeps its default budget mapping.
 */
export function thinkingLevelMapFromMetadata(metadata: ModelsDevMetadata): ThinkingLevelMap | undefined {
  const options = metadata.reasoning_options;
  if (!Array.isArray(options)) return undefined;

  const effort = options.find((option) => option?.type === "effort" && Array.isArray(option.values));
  if (!effort?.values) return undefined;

  const accepted = new Set(effort.values);
  const map: ThinkingLevelMap = {};

  for (const level of PI_EFFORT_LEVELS) {
    map[level] = accepted.has(level) ? level : null;
  }

  if (accepted.has("none")) {
    map.off = "none";
  } else if (options.every((option) => option?.type === "effort")) {
    map.off = null;
  }

  return map;
}

export function getModelCapabilityOverrides(context: ModelCapabilityContext): ModelCapabilityOverrides {
  const resolved: ModelCapabilityOverrides = {};

  for (const rule of MODEL_CAPABILITY_RULES) {
    if (!rule.matches(context)) continue;
    if (rule.overrides.reasoning !== undefined) resolved.reasoning = rule.overrides.reasoning;
    if (rule.overrides.thinkingLevelMap) resolved.thinkingLevelMap = { ...rule.overrides.thinkingLevelMap };
  }

  return resolved;
}
