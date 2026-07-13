# pi-cliproxyapi-provider

`pi-cliproxyapi-provider` registers one [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) instance as a pi model provider. It discovers models from CLIProxyAPI's OpenAI-compatible `/v1/models` endpoint and enriches them with metadata from [models.dev](https://models.dev/).

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

Project config only supports metadata aliases. Connection and auth settings such as `baseUrl`, `providerName`, `authRequired`, `authHeader`, and `headers` must be set in global config or environment variables.

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
```

## Metadata aliases

Aliases affect metadata only. The package still sends the original CLIProxyAPI model ID to the proxy.

Add global aliases to:

```text
~/.pi/agent/pi-cliproxyapi-provider/config.json
```

Add project aliases manually to:

```text
.pi/pi-cliproxyapi-provider/config.json
```

Project config only reads `modelAliases`; other fields are ignored.

```json
{
  "modelAliases": {
    "claude-opus-4-6-thinking": "anthropic/claude-opus-4-6"
  }
}
```

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

A scheduled GitHub Actions workflow checks the bundled fallback catalog daily. When it changes, the workflow validates the package, bumps the patch version, commits the update, and publishes the new version to npm. Maintainers can also update the catalog locally with:

```bash
npm run update:models-dev
```

## Test

```bash
npm test
```

## Release

Releases are published to npm when a matching `v*` tag is pushed. Changed daily models.dev catalogs also produce automatic patch releases. See [RELEASING.md](RELEASING.md) for authentication, versioning, verification, and troubleshooting.
