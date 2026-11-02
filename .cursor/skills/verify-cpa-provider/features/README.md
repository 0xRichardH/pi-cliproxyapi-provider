# CLIProxyAPI provider verification map

This directory is the maintained source for verifying the user-facing behavior of `pi-cliproxyapi-provider`. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Start a run with `.cursor/skills/verify-cpa-provider/scripts/cpa-verify start`. Each run owns a fake CLIProxyAPI upstream, an isolated `HOME`, a pi TUI in tmux, and an artifact directory.
- Run `cpa-verify doctor` and require every check to pass before driving.
- The fake upstream serves these four models:

| Model ID | Owner | API selected by the package | Context | Max out | Thinking | Images |
| --- | --- | --- | --- | --- | --- | --- |
| `gpt-5.5` | `openai` | `openai-responses` | 272K | 128K | yes | yes |
| `gpt-5.4` | `openai` | `openai-responses` | 272K | 128K | yes | yes |
| `claude-opus-4-6-thinking` | `antigravity` | `anthropic-messages` | 1M | 128K | yes | yes |
| `unknown-local` | `feedmob-litellm` | `completions` | 128K | 16.4K | no | no |

- Baseline status: `Models: 4 (3 enriched, 1 unmatched)`, `Reasoning models: 3`, `Image-capable models: 3`, `models.dev metadata: bundled`.
- Baseline has no project config at `work/.pi/pi-cliproxyapi-provider/config.json`, no provider settings in `home/.pi/agent/settings.json`, and no global connection config at `home/.pi/agent/pi-cliproxyapi-provider/config.json`.
- The fake upstream does not validate API keys. Auth proof is the `Authorization: Bearer verify-key` header recorded in `server/requests.jsonl`.
- Never drive an instance that this verification run did not start.

## Resetting to baseline

After a journey that mutates config, settings, or the fake catalog:

```bash
cpa-verify reset
```

`reset` clears project config, provider settings, the global connection config, and the fake catalog, then restarts the TUI. `restart` re-reads project config and settings and rediscovers the four fixtures.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Run TUI actions through `cpa-verify send` and `cpa-verify key`. Run CLI actions through `cpa-verify list-models` and `cpa-verify chat`.
- Run one drive at a time. The upstream request log is shared, so parallel chats make the per-call request slice ambiguous.
- After `Escape` in `/cliproxyapi config` or `/cliproxyapi models`, wait at least 5 seconds before asserting: pi saves and reloads when a setting or override changed.
- After writing project config, run `cpa-verify restart`; project config is read when the extension loads.
- Prefer the `list-models` table for deterministic assertions. Use `requests` for side effects and `capture` for TUI state.
- Use artifact names that identify the feature and step, for example `refresh/models-updated` or `aliases/baseline`.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- TUI proof is a captured pane containing the command output. CLI proof is the recorded stdout and exit code.
- Side-effect proof is the upstream request line plus the relevant payload fields: path, model, auth header, stream/store flags, thinking and effort, and tool `strict` values.
- Assert expected text in the artifact. `pi -p` exits `0` even when the upstream returns an HTTP error.
- Report an unreachable path with the attempted command and the unmet precondition. A path that needs the public internet, such as a models.dev metadata refresh, is not proven by the offline fake upstream.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with cpa-verify` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Model discovery and registration](./model-discovery.md) covers startup discovery, `--list-models`, metadata enrichment, unmatched fallback, and API routing.
- [Chat routing](./chat-routing.md) covers Chat Completions, Responses, Anthropic Messages, bearer auth, and the Codex strict-tool contract.
- [Provider status](./provider-status.md) covers counts, endpoint, auth, snapshot age, metadata source, and context mode.
- [Refresh](./refresh.md) covers models-only refresh, full refresh, metadata refresh, and failure retention.
- [Aliases and overrides](./aliases-and-overrides.md) covers unmatched reporting, metadata aliases, bounded overrides, and the model inspector.
- [Configuration](./configuration.md) covers the tabbed panel, context-window mode, strict-schema display, and the connection editor.
