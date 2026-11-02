# Model discovery and registration

Model discovery turns the CLIProxyAPI `/v1/models` response into pi models: every reported ID is registered unchanged, enriched with models.dev metadata, and routed to the API the package selects for that model family.

## Sub-features

- `discovery-startup` registers the cached catalog at startup and refreshes it from the upstream.
- `discovery-list` shows the registered models in `pi --list-models cpa`.
- `discovery-enrich` applies models.dev names, limits, modalities, cost, and reasoning.
- `discovery-unmatched` keeps an unknown ID with explicit pi defaults instead of dropping it.
- `discovery-routing` selects Chat Completions, Responses, or Anthropic Messages per model.

## How to get to it (user POV)

- Start pi with the provider loaded; the provider registers during extension load.
- Run `pi --list-models cpa` from a terminal.
- Open `/model` in the pi TUI and choose the `cpa` provider.
- Run `/cliproxyapi models` in the pi TUI to inspect the current catalog.

## Driving it with cpa-verify

Preconditions:

- `cpa-verify doctor` passes.
- The run has no project config, so the baseline fixtures are unmodified.

- **Startup discovery.** Confirm the provider asked the upstream for models. Run `cpa-verify requests 20`. The TUI startup request is `GET /v1/models auth=Bearer verify-key`.
- **List registration.** Run `cpa-verify list-models cpa discovery/list`. The table has four `cpa` rows: `claude-opus-4-6-thinking`, `gpt-5.4`, `gpt-5.5`, and `unknown-local`.
- **Enriched metadata.** Assert the table values. `gpt-5.5` shows `272K` context, `128K` max out, thinking `yes`, images `yes`. `claude-opus-4-6-thinking` shows `1M` context and `128K` max out.
- **Unmatched fallback.** Assert the `unknown-local` row: `128K` context, `16.4K` max out, thinking `no`, images `no`. Its ID is preserved, not renamed.
- **API routing visibility.** Run `cpa-verify send "/cliproxyapi models" discovery/inspector`. The selector lists `claude-opus-4-6-thinking anthropic-messages`, `gpt-5.4 openai-responses`, `gpt-5.5 openai-responses`, and `unknown-local completions`. Run `cpa-verify key Escape discovery/inspector-close` to close it before another command.
- **Proof.** Keep `artifacts/discovery/list.txt` and `artifacts/discovery/inspector.txt`. The request log line for discovery is in `server/requests.jsonl`; summarize it with `cpa-verify requests 20`.

## Gotchas

- On a completely empty cache, the first process registers `login-required` until background discovery finishes. Wait for `cpa-verify start` to report `4 discovered`; do not record the placeholder as the catalog.
- A `--model cpa/<id>` for an ID that is not registered prints `Warning: Model "<id>" not found for provider "cpa". Using custom model id.` and falls back to the provider-default Chat Completions API. Warm the cache before using chat routing as proof.
- The CPA snapshot cache key includes the provider name and base URL. Changing either produces a fresh cache and a new discovery cycle.
- `pi --list-models` reads the persisted snapshot. With pi 1.5.0 it never contacts the upstream, even when only `CLIPROXYAPI_API_KEY` is set and no `/login` credential is stored; prove bearer auth with the TUI startup request or a chat request instead.
- The model inspector stays open after it renders. A slash command sent while it is open is interpreted as a filter or selection, not a command. Close it with `Escape` before the next journey.
- models.dev metadata comes from the bundled snapshot on a first run. No public network is needed for enrichment in this harness.
- The provider registers every upstream ID. A missing row means discovery returned fewer models, not that the package filtered one out.
