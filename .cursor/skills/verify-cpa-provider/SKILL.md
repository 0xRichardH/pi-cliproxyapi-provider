---
name: verify-cpa-provider
description: Drive the pi-cliproxyapi-provider package end to end against a fake CLIProxyAPI upstream: launch pi with the extension in tmux, exercise model discovery, chat routing, status, refresh, aliases, overrides, and configuration, and capture proof. Use when verifying a change to this provider or reproducing user-reported provider behavior.
---

# Verify pi-cliproxyapi-provider

This package registers one CLIProxyAPI instance as a pi model provider. A user touches it in two places: the pi CLI (`pi --list-models cpa`, non-interactive `pi -p`) and the pi TUI (`/cliproxyapi status|refresh|aliases|models|config`, `/model`). This skill drives both against a fake CLIProxyAPI upstream that speaks the same three wire protocols pi uses: OpenAI Chat Completions, OpenAI Responses, and Anthropic Messages.

The fake upstream is verification scaffolding. Everything else is the real package, the real pi binary, and the real TUI.

## Before you start

- Required tools: `pi` (record the version; the harness expects 1.5.0), `node`, `tmux`, `curl`, `bash`.
- Run `npm ci` once in the repo if you also intend to run `npm test` or `npm run typecheck`. Launching pi with `-e .` works without `node_modules`.
- Never point this harness at your real `HOME`. Each run gets its own `HOME`, cache, config, and pi session under `/tmp/cpa-verify/<run-id>/`.
- Never drive a pi session that this harness did not start.

## Launch

From the repo root:

```bash
.cursor/skills/verify-cpa-provider/scripts/cpa-verify start
```

The helper:

1. Starts `scripts/fake-cpa-server.mjs` on `127.0.0.1:0` with four fixture models and a request log.
2. Starts `pi` in tmux at 160x50, with the run's `HOME`, the fake base URL, and `CLIPROXYAPI_API_KEY=verify-key`.
3. Loads this repo with `-e <repo>`, disables other extensions/MCP/skills/context files, uses `--no-session`, and passes `-a` so the trust prompt never appears.
4. Waits for the TUI prompt, for model discovery to write the CPA snapshot, and then prints the run paths.

Ready means all of these are true:

- The tmux pane contains `escape interrupt`.
- `artifacts/00-start.txt` shows the pi TUI.
- The run prints `models:  4 discovered`.
- `server/requests.jsonl` contains a `GET /v1/models` with `Authorization: Bearer verify-key`.

If startup fails, run `cpa-verify stop`. The helper records the session and server PID before starting the TUI, and it kills both on failure.

## Doctor

Run this first whenever anything looks off:

```bash
.cursor/skills/verify-cpa-provider/scripts/cpa-verify doctor
```

It is read-only and checks the run environment, isolated `HOME`, fake upstream process and endpoint, four-model fixture catalog, CPA snapshot cache, tmux session, rendered TUI, extension entry point, and the pi version recorded at launch. A non-zero exit means the instance is not worth driving.

## Drive

TUI actions go through tmux:

```bash
.cursor/skills/verify-cpa-provider/scripts/cpa-verify send "/cliproxyapi status" status/baseline
.cursor/skills/verify-cpa-provider/scripts/cpa-verify key Tab config/models-tab
.cursor/skills/verify-cpa-provider/scripts/cpa-verify key Enter config/models-cycle
.cursor/skills/verify-cpa-provider/scripts/cpa-verify key Escape config/saved
.cursor/skills/verify-cpa-provider/scripts/cpa-verify wait 6 config/after-reload
.cursor/skills/verify-cpa-provider/scripts/cpa-verify capture status/current
```

`send` types the whole line and presses Enter in one tmux call, which avoids pi's slash-command autocomplete consuming the first Enter, then settles for 3 seconds before capturing. If a command ever appears unsubmitted, send `key Enter` once more. Add `wait 3` after a refresh when its notification renders late. `wait` is required after actions that reload pi (`Esc` in `/cliproxyapi config` or `/cliproxyapi models`, and `restart`).

CLI actions run in a fresh pi process with the same isolated environment:

```bash
.cursor/skills/verify-cpa-provider/scripts/cpa-verify list-models cpa discovery/list
.cursor/skills/verify-cpa-provider/scripts/cpa-verify chat cpa/gpt-5.4 "Reply with exactly: pong" chat/responses
```

`chat` prints the assistant output, then summarizes the upstream requests made during that call. `list-models` and `chat` run their own provider startup, so they also exercise registration from the persisted snapshot.

Inspect the upstream side directly:

```bash
.cursor/skills/verify-cpa-provider/scripts/cpa-verify requests 20
```

Mutate the fake catalog or force a discovery failure:

```bash
.cursor/skills/verify-cpa-provider/scripts/cpa-verify catalog add gpt-5.6-sol openai
.cursor/skills/verify-cpa-provider/scripts/cpa-verify catalog fail 500
.cursor/skills/verify-cpa-provider/scripts/cpa-verify catalog reset
```

Run one drive at a time against a run. The request log is shared, and concurrent `chat` calls make each call's request slice ambiguous.

## Evidence

Every artifact goes to `/tmp/cpa-verify/<run-id>/artifacts/`. `capture` and `send` print `ARTIFACT <path>` on stderr, and `chat`/`list-models` write their output there too.

Proof standards:

- Exercise the user path: a TUI command or a real `pi -p` chat. Do not call internal modules or the fake upstream's control endpoints as proof of user behavior.
- Capture the action and the resulting state. A screenshot of the final screen without the command output is not enough; `send` captures the pane after the command, and `list-models` records the exact table.
- Verify side effects alongside the visible result. Model registration is proven by the `--list-models` table plus the `GET /v1/models` request. Chat routing is proven by the assistant output plus the `POST` path and payload in `requests.jsonl`.
- Assert the expected text in the artifact. `pi -p` exits `0` even when the provider returns an HTTP error, so an exit code alone proves nothing; require `pong` in the output.
- The fake upstream is the only mock, and it stands in for a production boundary (CLIProxyAPI). Do not mock the extension, pi, or the model metadata.

## Cleanup

```bash
.cursor/skills/verify-cpa-provider/scripts/cpa-verify stop
```

`stop` captures the final pane to `artifacts/99-final-pane.txt`, kills the recorded tmux session, and kills the recorded server PID after checking that its command line is this skill's fake server. It never kills by process name. Artifacts survive cleanup.

If a run is broken beyond repair, stop it, then start a new run id. Scratch state lives under the old run directory; proof artifacts from both runs remain.

## Helpers

All helpers live in `.cursor/skills/verify-cpa-provider/scripts/` and are executable.

| Command | Purpose |
| --- | --- |
| `cpa-verify start [run-id]` | Start the fake upstream and the pi TUI, then wait for discovery. |
| `cpa-verify stop` | Stop the session and upstream; keep artifacts. |
| `cpa-verify restart` | Restart only the TUI against the same upstream (after writing project config). |
| `cpa-verify doctor` | Read-only readiness checks. |
| `cpa-verify send <text> [name]` | Type a TUI command, submit, settle, capture. |
| `cpa-verify key <Key> [name]` | Send one key (`Enter`, `Escape`, `Tab`, `Down`, `C-c`). |
| `cpa-verify wait <seconds> [name]` | Wait, then optionally capture. |
| `cpa-verify capture [name]` | Capture the current pane. |
| `cpa-verify list-models [search] [name]` | Run `pi --list-models` in the run environment. |
| `cpa-verify chat <model> <prompt> [name]` | Run `pi -p` and print the matching upstream requests. |
| `cpa-verify requests [n]` | Summarize the last `n` upstream requests. |
| `cpa-verify catalog <show\|reset\|set\|add\|fail> [arg]` | Inspect or mutate the fake catalog. |
| `cpa-verify config <show\|write\|clear> [file]` | Manage the run's project config at `work/.pi/pi-cliproxyapi-provider/config.json`. |
| `cpa-verify settings <show\|clear>` | Inspect or clear the run's provider settings. |
| `cpa-verify env` | Print the active run environment. |

Set `CPA_VERIFY_RUN` to drive a run other than `/tmp/cpa-verify/current`. Set `CPA_VERIFY_WAIT` to change the default post-action settle time (seconds).

## Feature map

Read [features/README.md](features/README.md) before choosing a journey. It indexes the maintained feature files and the baseline fixtures.

## Known failures

- The model inspector can write a context-window override that the config parser rejects when `gpt56ContextWindow` is `full`. See `features/aliases-and-overrides.md` under Gotchas for the exact repro. Keep the context mode canonical when exercising that inspector path, or cycle to an allowed preset.
- With only `CLIPROXYAPI_API_KEY` set and no stored `/login` credential, non-interactive `pi --list-models` can repeat model discovery without the `Authorization` header (observed with pi 1.5.0). The fake upstream accepts it; prove bearer auth with the TUI startup request or a chat request.
