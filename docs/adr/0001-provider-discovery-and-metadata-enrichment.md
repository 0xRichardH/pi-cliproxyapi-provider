# Use CLIProxyAPI for discovery and models.dev for metadata

Accepted. The package discovers available models only from CLIProxyAPI's OpenAI-compatible `GET <baseUrl>/models` endpoint, then enriches those model IDs with models.dev metadata and user-defined metadata aliases. This avoids requiring CLIProxyAPI Management API access, keeps the proxy as the source of truth for availability, and still gives pi accurate context windows, output limits, reasoning flags, image support, and costs.

## Considered Options

- Use CLIProxyAPI Management API for model details. We rejected this because it requires a powerful management key and exposes configuration beyond model discovery.
- Trust `/v1/models` alone. We rejected this because the endpoint returns IDs and owners, not enough pi metadata.
- Download models.dev data at install time. We rejected this because install-time network fetches are brittle and become stale.

## Consequences

The package caches CPA model discovery for one hour and models.dev metadata for one day. Metadata aliases are metadata-only: the registered pi model keeps the original CLIProxyAPI model ID so requests still route through the proxy correctly.
