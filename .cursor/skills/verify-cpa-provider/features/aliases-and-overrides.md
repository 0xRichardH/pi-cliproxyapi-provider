# Aliases and overrides

Aliases fix metadata lookup for IDs that models.dev cannot resolve, and the aliased metadata also selects the wire API and thinking map. Overrides change the bounded capabilities pi publishes for a specific model. Both live in config, take effect on extension load, and never change the model ID sent to CLIProxyAPI.

## Sub-features

- `aliases-unmatched` lists model IDs that did not match models.dev metadata.
- `alias-resolve` maps an unmatched ID to a models.dev canonical ID; metadata and the API/thinking map follow the alias.
- `overrides-config` applies bounded reasoning, context-window, and max-token overrides from project config.
- `inspector-override` sets the same overrides through the TUI model inspector.
- `overrides-presets` rejects values outside the safe preset lists.

## How to get to it (user POV)

- Run `/cliproxyapi aliases` in the pi TUI to see unmatched IDs.
- Edit `work/.pi/pi-cliproxyapi-provider/config.json` (the project config) and restart pi.
- Run `/cliproxyapi models`, select a model, and change a bounded field.
- Run `pi --list-models cpa` to see the effective values.

## Driving it with cpa-verify

Preconditions:

- `cpa-verify doctor` passes.
- The run is at baseline: no project config, canonical context mode, four fixture models. If an earlier journey left state, run `cpa-verify reset`.

- **Baseline unmatched.** Run `cpa-verify send "/cliproxyapi aliases" aliases/baseline`. The pane shows `Unmatched CPA models (1):` with `"unknown-local": "<models.dev-id>"`.
- **Write project config.** Create a JSON file and run `cpa-verify config write <file>`. Use:
  ```json
  {
    "modelAliases": { "unknown-local": "openai/gpt-5.5" },
    "modelOverrides": { "gpt-5.5": { "contextWindow": 512000, "maxTokens": 32768 } }
  }
  ```
- **Reload.** Run `cpa-verify restart`. Project config is read at extension load.
- **Alias effect.** Run `cpa-verify list-models cpa aliases/list`. The `unknown-local` row now shows `272K` context, `128K` max out, thinking `yes`, images `yes`, while its ID stays `unknown-local`. The `gpt-5.5` row shows `512K` context and `32.8K` max out. In `/cliproxyapi models`, `unknown-local` now shows `openai-responses`, because the aliased metadata selects the API as well.
- **Alias clears the warning.** Run `cpa-verify send "/cliproxyapi aliases" aliases/resolved`. The pane shows `All CPA models matched models.dev metadata.`
- **Inspector inspection.** Run `cpa-verify send "/cliproxyapi models" inspector/list`. The selector shows the effective API, reasoning mode, and context for each model; `gpt-5.5` shows `512000 ctx override`.
- **Inspector override.** With the selector still open, run `cpa-verify key Down inspector/down` to select `gpt-5.4`, then `cpa-verify key Enter inspector/detail`. In the detail view, press `Down` once to `Context window`, then `Enter` three times (`inspector/ctx-1`, `inspector/ctx-2`, `inspector/ctx-3`). The field reads `512000`. Press `Escape` and run `cpa-verify wait 6 inspector/saved`.
- **Override effect.** Assert `work/.pi/pi-cliproxyapi-provider/config.json` contains `"gpt-5.4": { "contextWindow": 512000 }` alongside the alias and the `gpt-5.5` override. Run `cpa-verify list-models cpa inspector/list-after`; `gpt-5.4` shows `512K` context.
- **Proof.** Keep `artifacts/aliases/baseline.txt`, `aliases/list.txt`, `aliases/resolved.txt`, `inspector/list.txt`, `inspector/ctx-3.txt`, and `inspector/list-after.txt`.

## Gotchas

- Project config is read once when the extension loads. Editing the file without `cpa-verify restart` changes nothing registered. `/cliproxyapi models` re-reads `modelOverrides` when the command runs, so an edit can appear in the inspector before it affects the registered models.
- An alias changes metadata lookup and the API/thinking map derived from that metadata. The `--list-models` ID and the upstream `model` field stay the original CPA ID.
- Project config reads `metadataFallbackProvider`, `modelAliases`, and `modelOverrides`; connection and auth fields in that file are ignored. Global config accepts `modelAliases` and `modelOverrides` too, and those merge field by field with the project layer.
- Allowed override values: `reasoning` is boolean; `contextWindow` is one of `128000`, `272000`, `512000`, `1000000`; `maxTokens` is one of `4096`, `8192`, `16384`, `32768`, `65536`, `128000`. Project config also accepts `null` for a bounded field to clear an inherited global value. Anything else fails startup with `registered placeholder provider after startup failure`.
- The inspector's context-window cycle starts with `auto`, then the current effective value, then the presets. In canonical mode for a model with no override, the sequence is `auto`, `272000`, `128000`, `512000`, `1000000`. For a model that already has a `512000` override, it is `auto`, `512000`, `128000`, `272000`, `1000000`; pick a model without an override for the deterministic three-Enter recipe.
- Known bug: the inspector offers the current effective value even when it is not an allowed preset. In `full` context mode the first non-auto context value is the derived models.dev limit (`1050000` for these fixtures); canonical families can derive `400000` or `500000`, and metadata can supply max-token values outside the presets. Saving writes that value, and the next reload fails with `modelOverrides.<id>.contextWindow must be one of 128000, 272000, 512000, 1000000 or null in project config file`; `--list-models` then shows only `login-required`. Recover with `cpa-verify reset`. Keep canonical mode and an in-preset max-token value for this journey, or cycle to an allowed preset such as `1000000`.
- The inspector writes to the project config in the process working directory and always targets that project file; it does not fall back to global config. The harness runs pi in `work/`, so the repo checkout stays clean.
- `/cliproxyapi aliases` lists at most the first 30 unmatched IDs.
- A global override and a project override merge field by field, and the project value wins. This harness has no global override, so every observed value comes from project config.
