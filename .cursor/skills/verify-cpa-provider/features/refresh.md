# Refresh

Refresh re-reads one or both catalog sources and updates the running provider immediately. It reports which source changed, which failed, and how many models were registered.

## Sub-features

- `refresh-models` re-reads CLIProxyAPI availability and updates the provider without a reload.
- `refresh-all` re-reads both CLIProxyAPI and models.dev.
- `refresh-metadata` re-reads models.dev metadata only.
- `refresh-failure` keeps the last-known-good snapshot when a source fails.
- `refresh-persist` writes the new CPA snapshot for later processes.

## How to get to it (user POV)

- Run `/cliproxyapi refresh` in the pi TUI.
- Run `/cliproxyapi refresh models` for availability only.
- Run `/cliproxyapi refresh metadata` for models.dev metadata only.

## Driving it with cpa-verify

Preconditions:

- `cpa-verify doctor` passes.
- The run is at baseline with four fixture models. If an earlier journey changed the catalog or config, run `cpa-verify catalog reset`, `cpa-verify config clear`, and `cpa-verify restart`.

- **Add a model upstream.** Run `cpa-verify catalog add gpt-5.6-sol openai`. The upstream responds with five models.
- **Refresh models.** Run `cpa-verify send "/cliproxyapi refresh models" refresh/models`, then `cpa-verify wait 3 refresh/models-after`. The captured pane shows `CPA models: updated`, `models.dev metadata: not requested`, and `Registered: 5 models, 4 enriched, 1 unmatched.`
- **Confirm the running provider.** Run `cpa-verify send "/cliproxyapi status" refresh/status`. The count is now `Models: 5 (4 enriched, 1 unmatched)`.
- **Confirm persistence.** Run `cpa-verify list-models cpa refresh/list`. A fresh process shows five rows, including `gpt-5.6-sol`.
- **Fail a refresh.** Run `cpa-verify catalog fail 500`, then `cpa-verify send "/cliproxyapi refresh models" refresh/failure`, then `cpa-verify wait 3 refresh/failure-after`. The captured pane shows `CPA models: failed (CPA model discovery failed: HTTP 500 Internal Server Error); retained previous snapshot` and still reports `Registered: 5 models`.
- **Restore the upstream.** Run `cpa-verify catalog reset`.
- **Metadata refresh (network).** Run `cpa-verify send "/cliproxyapi refresh metadata" refresh/metadata`. With public network access, the pane reports `models.dev metadata: updated` or `unchanged`; without it, `failed (...)`. In both cases the CPA models are `not requested`.
- **Proof.** Keep `artifacts/refresh/models-after.txt`, `refresh/status.txt`, `refresh/list.txt`, `refresh/failure-after.txt`, and the upstream `GET /v1/models` lines.

## Gotchas

- `refresh` with no argument refreshes both sources and reaches `https://models.dev/api.json`. The fake upstream cannot intercept that request. Run it only when public network access is acceptable, and report a metadata path as unverified when it is not.
- `refresh models` never contacts models.dev. Prefer it for offline runs.
- A failed refresh retains the previous snapshot and still reports the previous registered count. That is the expected result, not a failed assertion.
- `catalog reset` changes only the fake upstream. The running provider keeps the refreshed catalog until the next refresh.
- The manual refresh timeout is 10 seconds; a hung upstream surfaces as a timeout failure and retains the snapshot.
- The notification can render after the default capture. Always add the follow-up `wait 3` before asserting a refresh result.
- A successful models refresh writes the CPA cache. A separate `list-models` process reads that cache, so it can prove persistence even though the TUI holds the live provider.
