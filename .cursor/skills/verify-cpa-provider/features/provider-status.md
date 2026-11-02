# Provider status

Status reports what the running provider currently knows: endpoint, auth mode, model and capability counts, snapshot ages, metadata source, and the Codex context-window mode.

## Sub-features

- `status-endpoint` shows the provider name, base URL, and whether auth is required.
- `status-counts` shows total, enriched, and unmatched model counts.
- `status-capabilities` shows reasoning and image-capable counts.
- `status-freshness` shows the CPA snapshot age and the models.dev metadata source and age.
- `status-context-mode` shows whether Codex GPT models use the canonical or full context window.

## How to get to it (user POV)

- Run `/cliproxyapi status` in the pi TUI.

## Driving it with cpa-verify

Preconditions:

- `cpa-verify doctor` passes.
- The run is at baseline: four fixture models, no refresh yet.

- **Open status.** Run `cpa-verify send "/cliproxyapi status" status/baseline`. The pane shows the status notification.
- **Endpoint and auth.** Assert `CLIProxyAPI provider: cpa`, `Base URL: http://127.0.0.1:<port>/v1`, and `Auth required: yes`.
- **Counts.** Assert `Models: 4 (3 enriched, 1 unmatched)`.
- **Capabilities.** Assert `Reasoning models: 3` and `Image-capable models: 3`.
- **Freshness.** Assert `CPA snapshot: <n>s ago` and `models.dev metadata: bundled`. A metadata age appears only when the source is a cache file.
- **Context mode.** Assert `Codex GPT context window: canonical family defaults` for the `gpt-5.4`/`gpt-5.5` fixtures.
- **Proof.** Keep `artifacts/status/baseline.txt`. The base URL port matches `cpa-verify env`.

## Gotchas

- Status notifications stack with earlier output. Capture the whole pane and assert the newest block; do not assume the first matching line is from this command.
- Status reads the in-memory snapshot, loading the persisted snapshot from disk when none is loaded. It does not contact CLIProxyAPI or models.dev, so it cannot prove network freshness by itself.
- Snapshot age changes between runs and is not a stable equality assertion. Assert the shape, not the exact number.
- The context-mode label reads `canonical family defaults` or `full models.dev limit`. Canonical windows are family-specific (`128000` for `gpt-5.3-codex-spark`, `400000` for `gpt-5.6-cyber`, `500000` for `gpt-6.1`), so read `--list-models` for per-model values.
- If registration fails, `/cliproxyapi status` reports `CLIProxyAPI provider is unavailable. Run /cliproxyapi config and reload pi.`; there is no status block to read. A first run with an empty cache can instead register a single `login-required` placeholder until background discovery finishes. Use `cpa-verify doctor` before treating either as a discovery bug.
- Run status after a refresh to prove the running provider updated. A separate `list-models` process proves the persisted cache, which is a different surface.
