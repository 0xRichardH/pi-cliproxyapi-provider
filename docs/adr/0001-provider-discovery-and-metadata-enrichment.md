# Use CLIProxyAPI for discovery and models.dev for metadata

Accepted. The package discovers available models only from CLIProxyAPI's OpenAI-compatible `GET <baseUrl>/models` endpoint, then enriches those model IDs with models.dev metadata and user-defined metadata aliases. This avoids requiring CLIProxyAPI Management API access, keeps the proxy as the source of truth for availability, and still gives pi accurate context windows, output limits, reasoning flags, image support, and costs.

## Considered Options

- Use CLIProxyAPI Management API for model details. We rejected this because it requires a powerful management key and exposes configuration beyond model discovery.
- Trust `/v1/models` alone. We rejected this because the endpoint returns IDs and owners, not enough pi metadata.
- Download models.dev data at install time. We rejected this because install-time network fetches are brittle and become stale.

## Consequences

The package registers the last successful CPA model snapshot immediately, then attempts a short background discovery and dynamically updates the provider when availability changes. The models.dev metadata snapshot does not expire automatically; users refresh it explicitly, while a scheduled repository workflow keeps the bundled fallback catalog current and publishes changed catalogs as patch releases. Metadata aliases are metadata-only: the registered pi model keeps the original CLIProxyAPI model ID so requests still route through the proxy correctly.

The provider defaults to the OpenAI Completions API for its mixed catalog. GPT-5.6 family models, including Codex variants, receive a model-level OpenAI Responses API override because their Responses usage shape is required for pi's token and cost accounting. Metadata comes from models.dev's provider catalog rather than its lab-level model catalog so provider-specific prices and context pricing tiers are available. When several providers publish the same model ID, a canonical CLIProxyAPI `owned_by` value such as `openai` selects that provider's metadata; metadata aliases remain the explicit override for proxy deployments whose billing route differs from the reported owner. Both initial registration and dynamic model refreshes use the same materialized model definitions.

GPT-5.6 models advertise Pi's conservative canonical `272000`-token context window by default rather than automatically inheriting the provider metadata maximum. This keeps compaction consistent with Pi's native model definitions and does not assume that every CLIProxyAPI route enables OpenAI's full long-context capability. Users can opt into the models.dev limit through `pi-cliproxyapi-provider.gpt56ContextWindow: "full"` in global or project `settings.json`; project settings override global settings. The opt-in can delay compaction substantially and may activate higher context-pricing tiers above `272000` input tokens.
