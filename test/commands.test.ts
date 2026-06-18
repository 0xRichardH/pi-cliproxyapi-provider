import test from "node:test";
import assert from "node:assert/strict";
import { cliproxyapiArgumentCompletions } from "../src/commands.ts";

test("slash command argument completions include labels for pi autocomplete", () => {
  const completions = cliproxyapiArgumentCompletions("sta");

  assert.deepEqual(completions, [{ value: "status", label: "status" }]);
});
