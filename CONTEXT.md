# Pi CLIProxyAPI Provider

This context defines the language for the pi package that registers one CLIProxyAPI instance as a pi model provider. It keeps the proxy's available model IDs separate from the metadata used to describe them in pi.

## Language

**CLIProxyAPI instance**:
One OpenAI-compatible CLIProxyAPI server at a single base URL. The package supports one instance in v1.
_Avoid_: Backend, proxy group, provider fleet

**provider name**:
The pi registry name for the CLIProxyAPI instance, defaulting to `cpa`. Users may change it, but one configured instance has one provider name.
_Avoid_: Instance name, package name

**model discovery endpoint**:
The OpenAI-compatible `GET <baseUrl>/models` endpoint on the CLIProxyAPI instance. It is the only source of available models in v1.
_Avoid_: Management API, config API

**available model**:
A model ID returned by the model discovery endpoint. The package registers every available model in v1.
_Avoid_: Supported model, known model

**model metadata**:
Capability, limit, modality, and cost facts about a model. The package gets model metadata from models.dev and explicit config, not from CLIProxyAPI discovery.
_Avoid_: Model config, model data

**metadata alias**:
A config entry that maps an available model ID to a models.dev canonical ID for metadata lookup only. It never changes the model ID sent to CLIProxyAPI.
_Avoid_: Rename, route alias

**registered pi model**:
An available model enriched with model metadata and passed to `pi.registerProvider()`. Its `id` remains the original CLIProxyAPI model ID.
_Avoid_: models.dev model, alias model

**CPA model snapshot**:
The last successful response from the model discovery endpoint. Startup registers it immediately, then attempts a short background refresh and dynamically updates the provider when availability changes.
_Avoid_: Provider cache, model metadata cache

**model metadata snapshot**:
The persisted `models.dev/models.json` catalog. It does not expire automatically and changes only through an explicit refresh. When no snapshot exists, startup uses the bundled snapshot.
_Avoid_: CPA cache, discovery cache
