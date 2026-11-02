import http from "node:http";
import fs from "node:fs";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 0);
const portFile = process.env.PORT_FILE;
const logPath = process.env.REQLOG;

const DEFAULT_MODELS = [
  { id: "gpt-5.5", object: "model", owned_by: "openai" },
  { id: "gpt-5.4", object: "model", owned_by: "openai" },
  { id: "claude-opus-4-6-thinking", object: "model", owned_by: "antigravity" },
  { id: "unknown-local", object: "model", owned_by: "feedmob-litellm" },
];

let models = structuredClone(DEFAULT_MODELS);
let modelsStatus = 200;

function record(entry) {
  if (!logPath) return;
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
}

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function readModelsPayload(raw) {
  const parsed = JSON.parse(raw || "{}");
  const entries = Array.isArray(parsed) ? parsed : parsed.data;
  if (!Array.isArray(entries)) throw new Error("expected an array or { data: [...] }");
  const normalized = entries.map((entry) => {
    if (!entry || typeof entry.id !== "string" || entry.id.trim() === "") {
      throw new Error("every model needs a non-empty string id");
    }
    return {
      id: entry.id,
      object: entry.object ?? "model",
      ...(typeof entry.owned_by === "string" ? { owned_by: entry.owned_by } : {}),
      ...(typeof entry.created === "number" ? { created: entry.created } : {}),
    };
  });
  return normalized;
}

function chatCompletion(res, payload) {
  const id = "chatcmpl-verify-1";
  const created = Math.floor(Date.now() / 1000);
  if (payload.stream) {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const chunk = (delta, finish = null) => `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: payload.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.write(chunk({ role: "assistant", content: "" }));
    res.write(chunk({ content: "pong" }));
    res.write(chunk({}, "stop"));
    res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: payload.model, choices: [], usage: { prompt_tokens: 11, completion_tokens: 1, total_tokens: 12 } })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }
  sendJson(res, 200, {
    id,
    object: "chat.completion",
    created,
    model: payload.model,
    choices: [{ index: 0, message: { role: "assistant", content: "pong" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 11, completion_tokens: 1, total_tokens: 12 },
  });
}

function responsesCompletion(res, payload) {
  const id = "resp-verify-1";
  const created = Math.floor(Date.now() / 1000);
  const item = {
    id: "msg-verify-1",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: "pong", annotations: [] }],
  };
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  sse(res, "response.created", { type: "response.created", response: { id, object: "response", created_at: created, status: "in_progress", model: payload.model, output: [] } });
  sse(res, "response.output_item.added", { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } });
  sse(res, "response.content_part.added", { type: "response.content_part.added", item_id: item.id, output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } });
  sse(res, "response.output_text.delta", { type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta: "pong" });
  sse(res, "response.output_text.done", { type: "response.output_text.done", item_id: item.id, output_index: 0, content_index: 0, text: "pong" });
  sse(res, "response.content_part.done", { type: "response.content_part.done", item_id: item.id, output_index: 0, content_index: 0, part: item.content[0] });
  sse(res, "response.output_item.done", { type: "response.output_item.done", output_index: 0, item });
  sse(res, "response.completed", {
    type: "response.completed",
    response: {
      id,
      object: "response",
      created_at: created,
      status: "completed",
      model: payload.model,
      output: [item],
      usage: { input_tokens: 11, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 12 },
    },
  });
  res.end();
}

function anthropicMessage(res, payload) {
  const id = "msg-verify-1";
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  sse(res, "message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model: payload.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 11, output_tokens: 0 } } });
  sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "pong" } });
  sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
  sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } });
  sse(res, "message_stop", { type: "message_stop" });
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${host}`);
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    record({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body.slice(0, 20_000),
      at: Date.now(),
    });

    try {
      if (req.method === "GET" && url.pathname === "/__verify/models") {
        sendJson(res, 200, { data: models });
        return;
      }
      if (req.method === "PUT" && url.pathname === "/__verify/models") {
        models = readModelsPayload(body);
        sendJson(res, 200, { data: models });
        return;
      }
      if (req.method === "POST" && url.pathname === "/__verify/reset") {
        models = structuredClone(DEFAULT_MODELS);
        modelsStatus = 200;
        sendJson(res, 200, { data: models });
        return;
      }
      if (req.method === "PUT" && url.pathname === "/__verify/models-status") {
        const parsed = JSON.parse(body || "{}");
        modelsStatus = Number(parsed.status ?? 200);
        sendJson(res, 200, { status: modelsStatus });
        return;
      }
      if (req.method === "GET" && url.pathname === "/v1/models") {
        if (modelsStatus !== 200) {
          sendJson(res, modelsStatus, { error: { message: `forced status ${modelsStatus}` } });
          return;
        }
        sendJson(res, 200, { object: "list", data: models });
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
        chatCompletion(res, JSON.parse(body || "{}"));
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/responses") {
        responsesCompletion(res, JSON.parse(body || "{}"));
        return;
      }
      if (req.method === "POST" && url.pathname === "/v1/messages") {
        anthropicMessage(res, JSON.parse(body || "{}"));
        return;
      }
      sendJson(res, 404, { error: { message: `no route ${req.method} ${url.pathname}` } });
    } catch (error) {
      sendJson(res, 400, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
  });
});

server.listen(port, host, () => {
  const actualPort = server.address().port;
  if (portFile) fs.writeFileSync(portFile, String(actualPort));
  console.log(`READY ${host}:${actualPort}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
