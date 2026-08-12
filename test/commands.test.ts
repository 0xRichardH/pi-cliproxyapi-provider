import test from "node:test";
import assert from "node:assert/strict";
import { cliproxyapiArgumentCompletions, registerCliproxyapiCommand } from "../src/commands.ts";

test("slash command argument completions include labels for pi autocomplete", () => {
  const completions = cliproxyapiArgumentCompletions("sta");

  assert.deepEqual(completions, [{ value: "status", label: "status" }]);
});

test("help documents every advertised command without requiring an available provider", async () => {
  let command: any;
  registerCliproxyapiCommand({
    registerCommand: (_name: string, definition: any) => { command = definition; },
  } as any);
  const notifications: Array<{ message: string; level: string }> = [];
  const ctx = {
    ui: {
      notify: (message: string, level: string) => notifications.push({ message, level }),
    },
  } as any;

  await command.handler("help", ctx);

  assert.equal(notifications[0].level, "info");
  for (const value of ["status", "refresh", "refresh models", "refresh metadata", "aliases", "models", "config", "config connection", "help"]) {
    assert.match(notifications[0].message, new RegExp(`/cliproxyapi ${value.replace(" ", "\\s+")}`));
  }
});

test("models and connection configuration are advertised for slash-command autocomplete", () => {
  assert.deepEqual(cliproxyapiArgumentCompletions("mod"), [{ value: "models", label: "models" }]);
  assert.deepEqual(cliproxyapiArgumentCompletions("config c"), [{ value: "config connection", label: "config connection" }]);
});

test("models reports its TUI requirement instead of being treated as an unknown command", async () => {
  let command: any;
  registerCliproxyapiCommand({
    registerCommand: (_name: string, definition: any) => { command = definition; },
  } as any, {} as any, {
    current: () => undefined,
    load: async () => ({ built: { models: [], stats: {} } }),
  } as any);
  const notifications: Array<{ message: string; level: string }> = [];

  await command.handler("models", {
    cwd: process.cwd(),
    hasUI: false,
    ui: { notify: (message: string, level: string) => notifications.push({ message, level }) },
  } as any);

  assert.equal(notifications[0].level, "warning");
  assert.match(notifications[0].message, /requires an interactive UI/);
});

test("an empty command shows help", async () => {
  let command: any;
  registerCliproxyapiCommand({
    registerCommand: (_name: string, definition: any) => { command = definition; },
  } as any);
  const notifications: string[] = [];

  await command.handler("", {
    ui: { notify: (message: string) => notifications.push(message) },
  } as any);

  assert.match(notifications[0], /CLIProxyAPI provider commands:/);
});

test("an unknown command shows full usage and identifies the command", async () => {
  let command: any;
  registerCliproxyapiCommand({
    registerCommand: (_name: string, definition: any) => { command = definition; },
  } as any);
  const notifications: Array<{ message: string; level: string }> = [];

  await command.handler("wut", {
    ui: {
      notify: (message: string, level: string) => notifications.push({ message, level }),
    },
  } as any);

  assert.equal(notifications[0].level, "warning");
  assert.match(notifications[0].message, /CLIProxyAPI provider commands:/);
  assert.match(notifications[0].message, /Unknown command: wut/);
});
