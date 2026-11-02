import type { ThinkingLevel, ThinkingLevelMap } from "@earendil-works/pi-ai";
import { getModelApiOverride, isGpt53CodexModel, isGpt53CodexSparkModel, isGpt54OrGpt55Model, isGpt6Model, isProModel } from "./model-api.ts";
import type { ModelsDevCatalog, ModelsDevMetadata } from "./types.ts";

export interface ModelCapabilityContext {
  availableModelId: string;
  metadataModelId?: string;
  metadata?: ModelsDevMetadata;
  catalog?: ModelsDevCatalog;
}

export interface ModelCapabilityOverrides {
  reasoning?: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
}

interface ModelCapabilityRule {
  matches: (context: ModelCapabilityContext) => boolean;
  overrides: (context: ModelCapabilityContext) => ModelCapabilityOverrides;
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

const GPT_5_X_THINKING_LEVEL_MAP: ThinkingLevelMap = {
  off: "none",
  minimal: null,
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: null,
};

const GPT_5_X_PRO_THINKING_LEVEL_MAP: ThinkingLevelMap = {
  off: null,
  minimal: null,
  low: null,
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: null,
};

const GPT_5_3_CODEX_SPARK_THINKING_LEVEL_MAP: ThinkingLevelMap = {
  off: null,
  minimal: null,
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: null,
};

const PI_EFFORT_LEVELS: readonly ThinkingLevel[] = ["minimal", "low", "medium", "high", "xhigh", "max"];

function includesModelFamily(context: ModelCapabilityContext, family: string): boolean {
  return [context.availableModelId, context.metadataModelId]
    .filter((id): id is string => id !== undefined)
    .some((id) => id.includes(family));
}

function reasoningMetadata(context: ModelCapabilityContext): ModelsDevMetadata | undefined {
  const metadata = context.metadata;
  if (!metadata) return undefined;
  const canonicalId = metadata.canonical_model_id;
  return (canonicalId ? context.catalog?.[canonicalId] : undefined) ?? metadata;
}

function thinkingLevelMapFromReasoningOptions(metadata: ModelsDevMetadata | undefined): ThinkingLevelMap | undefined {
  const options = metadata?.reasoning_options;
  if (!Array.isArray(options)) return undefined;
  const effort = options.find((option) => option?.type === "effort" && Array.isArray(option.values));
  if (!effort?.values) return undefined;
  const accepted = new Set(effort.values);
  const map: ThinkingLevelMap = {};
  for (const level of PI_EFFORT_LEVELS) map[level] = accepted.has(level) ? level : null;
  if (accepted.has("none")) map.off = "none";
  else if (options.every((option) => option?.type === "effort")) map.off = null;
  return map;
}

const MODEL_CAPABILITY_RULES: readonly ModelCapabilityRule[] = [
  {
    matches: (context) => includesModelFamily(context, "gpt-5.6"),
    overrides: () => ({
      reasoning: true,
      thinkingLevelMap: GPT_5_6_THINKING_LEVEL_MAP,
    }),
  },
  {
    matches: (context) => isGpt6Model(context),
    overrides: () => ({
      reasoning: true,
      thinkingLevelMap: GPT_6_THINKING_LEVEL_MAP,
    }),
  },
  {
    matches: (context) => isGpt53CodexModel(context) || isGpt54OrGpt55Model(context),
    overrides: () => ({
      reasoning: true,
      thinkingLevelMap: GPT_5_X_THINKING_LEVEL_MAP,
    }),
  },
  {
    matches: (context) => isGpt53CodexSparkModel(context),
    overrides: () => ({
      thinkingLevelMap: GPT_5_3_CODEX_SPARK_THINKING_LEVEL_MAP,
    }),
  },
  {
    matches: (context) => isGpt54OrGpt55Model(context) && isProModel(context),
    overrides: () => ({
      thinkingLevelMap: GPT_5_X_PRO_THINKING_LEVEL_MAP,
    }),
  },
  {
    matches: (context) => getModelApiOverride(context) === "anthropic-messages",
    overrides: (context) => {
      const thinkingLevelMap = thinkingLevelMapFromReasoningOptions(reasoningMetadata(context));
      return thinkingLevelMap ? { thinkingLevelMap } : {};
    },
  },
];

export function getModelCapabilityOverrides(context: ModelCapabilityContext): ModelCapabilityOverrides {
  const resolved: ModelCapabilityOverrides = {};

  for (const rule of MODEL_CAPABILITY_RULES) {
    if (!rule.matches(context)) continue;
    const overrides = rule.overrides(context);
    if (overrides.reasoning !== undefined) resolved.reasoning = overrides.reasoning;
    if (overrides.thinkingLevelMap) resolved.thinkingLevelMap = { ...overrides.thinkingLevelMap };
  }

  return resolved;
}
