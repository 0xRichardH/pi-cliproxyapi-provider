# pi-cliproxyapi-provider

`pi-cliproxyapi-provider` registers one [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) instance as a pi model provider. It discovers models from CLIProxyAPI's OpenAI-compatible `/v1/models` endpoint and enriches them with provider-specific metadata from [models.dev](https://models.dev/). Mixed catalogs use OpenAI Completions by default, while GPT-5.6 family models (including Codex variants) use the Responses API so pi can read their usage data. Canonical `/v1/models` owners such as `openai` select the matching provider metadata; aliases can override that selection when a proxy routes billing differently.

## Install

Install from npm:

```bash
pi install npm:pi-cliproxyapi-provider
```

Or install from GitHub:

```bash
pi install git:github.com/0xRichardH/pi-cliproxyapi-provider@master
```

You can omit `@master`, but pinning a branch, tag, or commit makes Git installs reproducible:

```bash
pi install git:github.com/0xRichardH/pi-cliproxyapi-provider@a28f326
```

Restart pi after installing, then run:

```text
/cliproxyapi config
/login cpa
/model
```

## Install for local testing

From this repository:

```bash
pi -e .
```

List models without installing:

```bash
CLIPROXYAPI_BASE_URL=http://localhost:8317/v1 \
CLIPROXYAPI_API_KEY=your-key \
pi -e . --list-models cpa
```

## Configure

Run the interactive command:

```text
/cliproxyapi config
```

It writes global connection/auth config to:

```text
~/.pi/agent/pi-cliproxyapi-provider/config.json
```

Environment variables override config:

```text
CLIPROXYAPI_BASE_URL
CLIPROXYAPI_PROVIDER_NAME
CLIPROXYAPI_AUTH_REQUIRED
CLIPROXYAPI_AUTH_HEADER
CLIPROXYAPI_MODELS_DEV_ENABLED
```

Project config supports metadata aliases and bounded per-model overrides. Connection and auth settings such as `baseUrl`, `providerName`, `authRequired`, `authHeader`, and `headers` must be set in global config or environment variables.

### GPT-5.6 context window

The provider advertises a `272000`-token context window for GPT-5.6 models by default. This matches Pi's conservative canonical limit, keeps compaction behavior consistent with native model definitions, and avoids assuming that every CLIProxyAPI upstream account or route enables the provider's full long-context limit.

To opt into the full context limit reported by models.dev (currently `1050000` tokens for OpenAI GPT-5.6 models), add this package-specific setting to global `~/.pi/agent/settings.json`:

```json
{
  "pi-cliproxyapi-provider": {
    "gpt56ContextWindow": "full"
  }
}
```

The same setting can be placed in project `.pi/settings.json`; project settings override global settings. Supported values are:

- `"canonical"` (default): advertise `272000` tokens and compact at Pi's conservative boundary.
- `"full"`: advertise the models.dev context limit, allowing Pi to retain substantially more history before compaction.

Use `"full"` only when the selected CLIProxyAPI route and upstream account actually support that limit. Requests above `272000` input tokens also use the higher models.dev context-pricing tier where one is defined.

### Model and display configuration

Run `/cliproxyapi config` in Pi TUI mode to edit every package-level `settings.json` value. The tabbed panel has `Connection`, `Models`, and `Display` sections; it controls the GPT-5.6 context-window mode and whether the model selector shows the published strict tool-schema capability.

```json
{
  "pi-cliproxyapi-provider": {
    "gpt56ContextWindow": "canonical",
    "showStrictMode": false
  }
}
```

`showStrictMode` defaults to `false` because the selector stays compact for normal use. Enable it when diagnosing tool-schema behavior; model details always show `Strict tool schema` explicitly. Saving through `/cliproxyapi config` reloads Pi. Select `Connection` to open the endpoint and authentication editor.

## Authenticate

Use pi's normal API-key login flow:

```text
/login cpa
```

If you changed the provider name, use that name instead:

```text
/login 0xdev
```

For non-interactive runs, set:

```bash
export CLIPROXYAPI_API_KEY=your-key
```

## Commands

```text
/cliproxyapi config             # interactive setup
/cliproxyapi status             # show snapshots, capabilities, and enrichment counts
/cliproxyapi refresh            # refresh models and metadata, then update pi immediately
/cliproxyapi refresh models     # refresh CLIProxyAPI availability only
/cliproxyapi refresh metadata   # refresh models.dev metadata only
/cliproxyapi aliases            # show unmatched model IDs for metadata aliases
/cliproxyapi models             # inspect effective model settings and set bounded overrides
/cliproxyapi config             # tabbed connection, model, and display configuration
/cliproxyapi config connection  # open endpoint and authentication editor
```

## Metadata aliases

Aliases affect metadata only. The package still sends the original CLIProxyAPI model ID to the proxy.

When `/v1/models` reports a canonical owner such as `openai`, the package uses that provider's metadata even if models.dev lists the model under several providers. Noncanonical owners can embed a provider hint, so `feedmob-opencode-go` resolves to `opencode-go` when that provider publishes the model. If ownership is still unresolved, the package uses OpenRouter metadata by default when there is exactly one matching OpenRouter entry. Set `metadataFallbackProvider` to another models.dev provider ID, or to `null` to disable this fallback. Add an alias when CLIProxyAPI's reported owner or fallback does not match the provider whose limits and pricing apply to your setup.

Add global aliases to:

```text
~/.pi/agent/pi-cliproxyapi-provider/config.json
```

Add project aliases manually to:

```text
.pi/pi-cliproxyapi-provider/config.json
```

Project config reads `metadataFallbackProvider`, `modelAliases`, and `modelOverrides`; other fields are ignored.

```json
{
  "metadataFallbackProvider": "openrouter",
  "modelAliases": {
    "claude-opus-4-6-thinking": "anthropic/claude-opus-4-6",
    "gpt-5.6-sol": "openai/gpt-5.6-sol"
  },
  "modelOverrides": {
    "gpt-5.6-sol": {
      "contextWindow": 512000,
      "maxTokens": 32768
    }
  }
}
```

## Model inspector and overrides

Run `/cliproxyapi models` in Pi TUI mode to inspect the models in the current CPA snapshot. The selector shows the effective API, reasoning mode, and context window. The detail view also shows input modalities, cost, thinking levels, and the compatibility values that Pi will publish.

Only `reasoning`, `contextWindow`, and `maxTokens` are editable. Values are constrained to safe presets; choose `auto` to remove an override and restore the derived value after reload. API routing and compatibility stay provider-owned: GPT-5.6/Codex models remain on `openai-responses`, while the CLIProxyAPI workaround publishes `supportsStrictMode: false`.

For CPA Responses requests, the extension also applies the Codex-compatible function-tool wire contract used by `pi-codex-conversion`: each function tool explicitly carries `strict: null`. This preserves optional tool arguments such as `interactive_shell.listBackground` without replacing CPA authentication, transport, discovery, or streaming with the ChatGPT-backed `openai-codex-responses` provider.

Saving writes to an existing project config when present, otherwise to the global provider config, then reloads Pi. Project overrides take precedence over global overrides field by field.

## Snapshots and startup

```text
CPA /v1/models:      local snapshot at startup, then a background refresh
models.dev metadata: persistent local snapshot, refreshed manually
```

Snapshots live under:

```text
~/.cache/pi-cliproxyapi-provider/
```

Startup registers the provider immediately from the last-known-good local snapshots. It then refreshes CLIProxyAPI availability in the background with a short timeout and updates the provider dynamically if the model list changed. On a first run, Pi registers a placeholder until background discovery succeeds. Startup never fetches `models.dev`; it uses the persistent local metadata snapshot or `data/models-dev-fallback.json` when no snapshot exists.

Manual refreshes update the running provider immediately; `/reload` is not required. Failed refreshes retain the last-known-good data independently for each source.

A scheduled GitHub Actions workflow checks the bundled fallback catalog daily. When it changes, the workflow validates the package, bumps the patch version, commits the update, and starts the normal release workflow. Maintainers can also update the catalog locally with:

```bash
npm run update:models-dev
```

## Test

```bash
npm test
```

## Release

Changing the `package.json` version on `master` automatically creates a matching Git tag and GitHub Release, generates release notes, and publishes the package to npm. Changed daily models.dev catalogs also produce automatic patch releases through the same workflow. See [RELEASING.md](RELEASING.md) for authentication, versioning, verification, and troubleshooting.
