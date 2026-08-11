import assert from "node:assert/strict";
import test from "node:test";
import { rewriteCodexCompatibleToolPayload } from "../src/codex-compat.ts";

const cpaResponsesModel = { provider: "cpa", api: "openai-responses" as const };

test("publishes Codex-compatible null strict markers for CPA Responses function tools", () => {
  const functionTool = {
    type: "function",
    name: "interactive_shell",
    parameters: {
      type: "object",
      properties: {
        listBackground: { type: "boolean" },
        spawn: { type: "object" },
      },
      required: [],
    },
  };
  const customTool = { type: "custom", name: "exec", format: { type: "text" } };

  const rewritten = rewriteCodexCompatibleToolPayload(
    { model: "gpt-5.6-sol", tools: [functionTool, customTool] },
    cpaResponsesModel,
    "cpa",
  ) as { tools: Array<Record<string, unknown>> };

  assert.equal(rewritten.tools[0]?.strict, null);
  assert.deepEqual(rewritten.tools[0]?.parameters, functionTool.parameters);
  assert.deepEqual(rewritten.tools[1], customTool);
});

test("leaves non-CPA and non-Responses requests unchanged", () => {
  const payload = { tools: [{ type: "function", name: "test", strict: false }] };

  assert.equal(rewriteCodexCompatibleToolPayload(payload, { provider: "openai", api: "openai-responses" }, "cpa"), undefined);
  assert.equal(rewriteCodexCompatibleToolPayload(payload, { provider: "cpa", api: "openai-completions" }, "cpa"), undefined);
});

test("does not allocate a replacement when function tools already use null strict markers", () => {
  const payload = { tools: [{ type: "function", name: "test", strict: null }] };

  assert.equal(rewriteCodexCompatibleToolPayload(payload, cpaResponsesModel, "cpa"), undefined);
});
