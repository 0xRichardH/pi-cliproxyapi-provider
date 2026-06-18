# pi-cliproxyapi-provider

`pi-cliproxyapi-provider` registers one [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) instance as a pi model provider. It discovers models from CLIProxyAPI's OpenAI-compatible `/v1/models` endpoint and enriches them with metadata from [models.dev](https://models.dev/).

## Install

Install from GitHub:

```bash
pi install git:github.com/0xRichardH/pi-cliproxyapi-provider@master
```

You can omit `@master`, but pinning a branch, tag, or commit makes installs reproducible:

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

It writes non-secret config to one of these files:

```text
~/.pi/agent/pi-cliproxyapi-provider/config.json
.pi/pi-cliproxyapi-provider/config.json
```

Environment variables override config:

```text
CLIPROXYAPI_BASE_URL
CLIPROXYAPI_PROVIDER_NAME
CLIPROXYAPI_AUTH_REQUIRED
CLIPROXYAPI_AUTH_HEADER
CLIPROXYAPI_MODELS_DEV_ENABLED
```

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
/cliproxyapi config   # interactive setup
/cliproxyapi status   # show config, cache ages, and enrichment counts
/cliproxyapi refresh  # refresh caches, then run /reload
/cliproxyapi aliases  # show unmatched model IDs for metadata aliases
```

## Metadata aliases

Aliases affect metadata only. The package still sends the original CLIProxyAPI model ID to the proxy.

```json
{
  "modelAliases": {
    "claude-opus-4-6-thinking": "anthropic/claude-opus-4-6"
  }
}
```

## Caches

```text
CPA /v1/models cache: 1 hour
models.dev cache:    1 day
```

Caches live under:

```text
~/.cache/pi-cliproxyapi-provider/
```

If models.dev is unreachable, the package uses `data/models-dev-fallback.json`.

## Test

```bash
npm test
```
