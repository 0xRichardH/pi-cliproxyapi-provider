# Configuration

Configuration covers the tabbed `/cliproxyapi config` panel and the connection editor. The panel changes provider-level settings such as the Codex context-window mode and the strict-schema display. The connection editor writes the global endpoint and auth config.

## Sub-features

- `config-panel` opens the Connection, Models, and Display sections and switches with Tab.
- `config-context-mode` switches Codex GPT models between canonical and full context windows.
- `config-strict-display` toggles whether the model selector shows the published strict-schema value.
- `config-connection` edits provider name, base URL, auth requirement, and bearer-header behavior.
- `config-persist` writes provider settings and connection config to the isolated `HOME`.

## How to get to it (user POV)

- Run `/cliproxyapi config` in the pi TUI.
- Run `/cliproxyapi config connection` to jump straight to the endpoint and auth editor.
- Observe the effect with `pi --list-models cpa` and `/cliproxyapi status`.

## Driving it with cpa-verify

Preconditions:

- `cpa-verify doctor` passes.
- The run is at baseline: no project config, no provider settings, no global connection config, canonical context mode. If an earlier journey left state, run `cpa-verify reset`.
- The TUI is 160x50, so the panel is not clipped.

- **Open the panel.** Run `cpa-verify send "/cliproxyapi config" config/panel`. The pane shows `Connection / Models / Display` and the `Endpoint and authentication` row for `cpa`.
- **Models section.** Run `cpa-verify key Tab config/models-tab`. The pane shows `Codex GPT context window  canonical`.
- **Switch to full.** Run `cpa-verify key Enter config/models-full`. The value reads `full`. Run `cpa-verify key Escape config/saved` and `cpa-verify wait 6 config/after-reload`; the pane reports a reload.
- **Confirm persistence.** Read `home/.pi/agent/settings.json`. It contains `"pi-cliproxyapi-provider": { "gpt56ContextWindow": "full", "showStrictMode": false }`.
- **Confirm effect.** Run `cpa-verify list-models cpa config/list-full`. `gpt-5.4` and `gpt-5.5` show `1.1M` context; `claude-opus-4-6-thinking` stays `1M`; an unmatched `unknown-local` stays `128K`.
- **Display section.** Run `cpa-verify send "/cliproxyapi config" config/display-open`, then `cpa-verify key Tab config/display-models`, `cpa-verify key Tab config/display-tab`. The pane shows `Show strict tool schema  disabled`. Run `cpa-verify key Enter config/display-toggle`; it reads `enabled`. Run `cpa-verify key Escape config/display-saved` and `cpa-verify wait 6 config/display-reload`; `settings.json` now has `"showStrictMode": true`.
- **Connection editor.** Run `cpa-verify send "/cliproxyapi config connection" config/connection-prompt`. The pane prompts for the provider name with the current value `cpa`.
- **Accept each prompt.** Run `cpa-verify key Enter config/connection-name`, then `config/connection-url`, then `config/connection-auth` (selects `Yes`), then `config/connection-header` (selects `Yes`). Each prompt advances on Enter; blank input keeps the current value.
- **Confirm connection config.** Run `cpa-verify wait 6 config/connection-saved`, then read `home/.pi/agent/pi-cliproxyapi-provider/config.json`. It contains `providerName: "cpa"`, the fake upstream base URL, `authRequired: true`, and `authHeader: true`.
- **Proof.** Keep `artifacts/config/panel.txt`, `config/models-tab.txt`, `config/models-full.txt`, `config/display-tab.txt`, `config/connection-prompt.txt`, and `config/connection-saved.txt`.

## Gotchas

- Environment variables override config at runtime. The harness sets `CLIPROXYAPI_BASE_URL`, so after the connection editor writes the same URL, status still reports the environment value. Prove the write with the config file, and prove the effective endpoint with `/cliproxyapi status`.
- `Escape` saves and reloads only when a setting changed. With no change the panel closes without saving or reloading. A `Reloaded keybindings...` line already in the pane can be scrollback from an earlier save, so compare before and after rather than grepping once.
- Panel tab order is Connection, then Models, then Display, then back to Connection.
- The panel writes to project `.pi/settings.json` when it exists, otherwise to `home/.pi/agent/settings.json`. This harness has no project settings, so the global file is the expected destination.
- The auth-header prompt appears only when auth is required. Choosing `No` for auth skips it and writes `authHeader: false`.
- `showStrictMode` only adds a strict column to `/cliproxyapi models`. It does not change registration, requests, or the `--list-models` table.
- `config clear` and `settings clear` leave the global connection config written by the connection editor. Use `cpa-verify reset` to return the whole run to baseline.
- The connection editor writes global config under the run's isolated `HOME`. It never touches the real user config.
- A reload keeps the fake upstream port and the cached catalog; it does not restart the run.
