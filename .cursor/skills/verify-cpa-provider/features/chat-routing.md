# Chat routing

A chat prompt reaches CLIProxyAPI through one of three wire protocols. The package picks the protocol from the model family so pi can read usage data and preserve Claude thinking blocks, while the model ID sent upstream stays exactly as discovered.

## Sub-features

- `chat-completions` sends ordinary and unmatched models to `/v1/chat/completions`.
- `chat-responses` sends Codex GPT models (`gpt-5.3-codex*`, `gpt-5.4` through `gpt-5.9`, and `gpt-6*`) to `/v1/responses`.
- `chat-anthropic` sends Claude models to `/v1/messages`.
- `chat-auth` attaches the configured bearer credential to discovery and chat requests.
- `chat-strict` publishes `strict: null` on Responses function tools.

## How to get to it (user POV)

- Send a prompt in the pi TUI after choosing a `cpa` model with `/model`.
- Run `pi -p "<prompt>" --model cpa/<id>` from a terminal.
- Use `/cliproxyapi models` to see which API each model uses before chatting.

## Driving it with cpa-verify

Preconditions:

- `cpa-verify doctor` passes and `cpa-verify list-models cpa` shows the four fixtures.
- pi is at least 0.87.0, the package's peer dependency floor.
- Run one chat at a time so the upstream request log stays unambiguous.

- **Chat Completions.** Run `cpa-verify chat cpa/unknown-local "Reply with exactly: pong" chat/completions`. The output contains `pong`, and the request summary is `POST /v1/chat/completions auth=Bearer verify-key model=unknown-local stream=true`.
- **Responses.** Run `cpa-verify chat cpa/gpt-5.4 "Reply with exactly: pong" chat/responses`. The output contains `pong`, and the summary is `POST /v1/responses ... model=gpt-5.4 stream=true store=false tools=4 strict=null`.
- **Anthropic Messages.** Run `cpa-verify chat cpa/claude-opus-4-6-thinking "Reply with exactly: pong" chat/anthropic`. The output contains `pong`, and the summary is `POST /v1/messages?beta=true ... model=claude-opus-4-6-thinking stream=true thinking=adaptive effort=medium tools=4`.
- **Model ID preservation.** Assert every summary shows the discovered ID unchanged: `unknown-local`, `gpt-5.4`, and `claude-opus-4-6-thinking`.
- **Auth.** Assert every summary starts with `auth=Bearer verify-key`.
- **Strict tools.** For the Responses call, assert `strict=null` in the summary. The full payload in `server/requests.jsonl` has a `strict` key on every function tool.
- **Proof.** Keep `artifacts/chat/completions.txt`, `artifacts/chat/responses.txt`, and `artifacts/chat/anthropic.txt`.

## Gotchas

- `pi -p` exits `0` even when the upstream returns an HTTP error. Require `pong` in the artifact; do not rely on the exit code.
- `gpt-5.5` is a Codex Responses model, not a Chat Completions model. Use `unknown-local` to prove the Completions path.
- If the model is not registered, pi falls back to a custom model ID on the provider-default API and the routing assertion becomes meaningless. Run `list-models` first.
- Claude requests carry `?beta=true` and target `/v1/messages`, not `/v1/chat/completions`. The fake upstream routes by pathname and ignores the query string.
- The package strips a trailing `/v1` from the provider base URL for Claude models because pi appends `/v1/messages`. A wrong base URL shows up as a 404 at `/v1/v1/messages`.
- An alias can change the selected API because the alias target feeds the same family match. The Anthropic base URL and adaptive thinking follow the selected API, so a non-Claude ID aliased to Claude metadata routes to `/v1/messages` with adaptive thinking.
- The request body is truncated to 20 KB in the log. Enough of the tool list remains to inspect `strict`, but very large prompts will be cut.
- Parallel `chat` calls interleave in the request log and make the per-call slice ambiguous.
