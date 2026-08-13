import test from "node:test";
import assert from "node:assert/strict";
import { findMetadataMatch, normalizeModelName } from "../src/matching.ts";

const catalog = {
  "openai/gpt-5.5": { id: "openai/gpt-5.5", name: "GPT-5.5" },
  "deepseek/deepseek-v4-flash": { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash" },
  "minimax/MiniMax-M2.7": { id: "minimax/MiniMax-M2.7", name: "MiniMax-M2.7" },
  "anthropic/claude-opus-4-6": { id: "anthropic/claude-opus-4-6", name: "Claude Opus 4.6" },
  "google/gemini-3.1-flash-image-preview": { id: "google/gemini-3.1-flash-image-preview", name: "Nano Banana 2" }
};

test("normalizes model IDs for punctuation and case-insensitive matching", () => {
  assert.equal(normalizeModelName("MiniMax-M2.7"), "minimaxm27");
  assert.equal(normalizeModelName("minimax:m2-7"), "minimaxm27");
});

test("uses metadata-only aliases before heuristics", () => {
  const match = findMetadataMatch(
    { id: "claude-opus-4-6-thinking", owned_by: "antigravity" },
    catalog,
    { "claude-opus-4-6-thinking": "anthropic/claude-opus-4-6" }
  );

  assert.equal(match?.metadataId, "anthropic/claude-opus-4-6");
  assert.equal(match?.method, "alias");
});

test("matches by owner prefix when the owner is canonical", () => {
  const match = findMetadataMatch({ id: "gpt-5.5", owned_by: "openai" }, catalog, {});

  assert.equal(match?.metadataId, "openai/gpt-5.5");
  assert.equal(match?.method, "owner-prefix");
});

test("matches by exact suffix for router-owned models", () => {
  const match = findMetadataMatch({ id: "deepseek-v4-flash", owned_by: "feedmob-litellm" }, catalog, {});

  assert.equal(match?.metadataId, "deepseek/deepseek-v4-flash");
  assert.equal(match?.method, "suffix");
});

test("matches by normalized suffix when capitalization differs", () => {
  const match = findMetadataMatch({ id: "minimax-m2.7", owned_by: "feedmob-litellm" }, catalog, {});

  assert.equal(match?.metadataId, "minimax/MiniMax-M2.7");
  assert.equal(match?.method, "normalized-suffix");
});

test("uses a canonical owner to resolve otherwise ambiguous model IDs", () => {
  const ambiguous = {
    ...catalog,
    "other/gpt-5.5": { id: "other/gpt-5.5", name: "Other GPT-5.5" }
  };

  assert.equal(findMetadataMatch({ id: "gpt-5.5", owned_by: "router" }, ambiguous, {}), undefined);
  const match = findMetadataMatch({ id: "gpt-5.5", owned_by: "openai" }, ambiguous, {});
  assert.equal(match?.metadataId, "openai/gpt-5.5");
  assert.equal(match?.method, "owner-prefix");
  assert.equal(findMetadataMatch({ id: "unknown-model", owned_by: "router" }, catalog, {}), undefined);
});

test("extracts the longest recognizable provider hint from owned_by", () => {
  const ambiguous = {
    "opencode/glm-5.2": { id: "opencode/glm-5.2", sourceProvider: "opencode" },
    "opencode-go/glm-5.2": { id: "opencode-go/glm-5.2", sourceProvider: "opencode-go" },
    "zai/glm-5.2": { id: "zai/glm-5.2", sourceProvider: "zai" },
  };

  const match = findMetadataMatch({ id: "glm-5.2", owned_by: "feedmob-opencode-go" }, ambiguous, {});
  assert.equal(match?.metadataId, "opencode-go/glm-5.2");
  assert.equal(match?.method, "owner-hint");
});

test("does not infer an upstream provider from infrastructure-only owners", () => {
  const ambiguous = {
    "opencode-go/minimax-m3": { id: "opencode-go/minimax-m3", sourceProvider: "opencode-go" },
    "fireworks/minimax-m3": { id: "fireworks/minimax-m3", sourceProvider: "fireworks" },
    "minimax/minimax-m3": { id: "minimax/minimax-m3", sourceProvider: "minimax" },
  };

  assert.equal(findMetadataMatch({ id: "minimax-m3", owned_by: "ken-team-litellm" }, ambiguous, {}), undefined);
});

test("requires a unique best provider hint", () => {
  const ambiguous = {
    "first/model": { id: "first/model", sourceProvider: "foo-ai" },
    "second/model": { id: "second/model", sourceProvider: "bar-ai" },
  };

  assert.equal(findMetadataMatch({ id: "model", owned_by: "foo-ai-bar-ai" }, ambiguous, {}), undefined);
});

test("matches provider tokens rather than partial substrings", () => {
  const ambiguous = {
    "ai/model": { id: "ai/model", sourceProvider: "ai" },
    "other/model": { id: "other/model", sourceProvider: "other" },
  };

  assert.equal(findMetadataMatch({ id: "model", owned_by: "openai" }, ambiguous, {}, null), undefined);
});

test("uses a configured provider as the final unresolved metadata fallback", () => {
  const ambiguous = {
    "minimax/minimax-m3": { id: "minimax/minimax-m3", sourceProvider: "openrouter", reasoning: true },
    "opencode-go/minimax-m3": { id: "opencode-go/minimax-m3", sourceProvider: "opencode-go", reasoning: true },
  };

  const match = findMetadataMatch(
    { id: "minimax-m3", owned_by: "ken-team-litellm" },
    ambiguous,
    {},
    "openrouter",
  );
  assert.equal(match?.metadataId, "minimax/minimax-m3");
  assert.equal(match?.method, "provider-fallback");
});

test("does not use provider fallback when it is disabled or ambiguous", () => {
  const ambiguous = {
    "first/model": { id: "first/model", sourceProvider: "openrouter" },
    "second/model": { id: "second/model", sourceProvider: "openrouter" },
    "other/model": { id: "other/model", sourceProvider: "other" },
  };

  assert.equal(findMetadataMatch({ id: "model", owned_by: "router" }, ambiguous, {}, null), undefined);
  assert.equal(findMetadataMatch({ id: "model", owned_by: "router" }, ambiguous, {}, "openrouter"), undefined);
});

test("allows an explicit alias to override a canonical owner match", () => {
  const ambiguous = {
    ...catalog,
    "other/gpt-5.5": { id: "other/gpt-5.5", name: "Other GPT-5.5" }
  };

  const match = findMetadataMatch(
    { id: "gpt-5.5", owned_by: "openai" },
    ambiguous,
    { "gpt-5.5": "other/gpt-5.5" },
  );

  assert.equal(match?.metadataId, "other/gpt-5.5");
  assert.equal(match?.method, "alias");
});
