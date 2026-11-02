import fs from "node:fs";

const path = process.argv[2];
const limit = Number(process.argv[3] ?? 10);
if (!path || !fs.existsSync(path)) {
  console.error(`no request log at ${path ?? "(missing path)"}`);
  process.exit(1);
}

const lines = fs.readFileSync(path, "utf8").split("\n").filter(Boolean);
const start = Math.max(0, lines.length - limit);
for (const [offset, line] of lines.slice(start).entries()) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    console.log(`${start + offset + 1} unparsable request line`);
    continue;
  }
  const url = new URL(entry.url, "http://localhost");
  const auth = entry.headers?.authorization;
  let payload;
  try {
    payload = entry.body ? JSON.parse(entry.body) : undefined;
  } catch {
    payload = undefined;
  }
  const details = [];
  if (payload?.model) details.push(`model=${payload.model}`);
  if (payload?.stream !== undefined) details.push(`stream=${payload.stream}`);
  if (payload?.store !== undefined) details.push(`store=${payload.store}`);
  if (payload?.thinking) details.push(`thinking=${payload.thinking.type}`);
  if (payload?.output_config?.effort) details.push(`effort=${payload.output_config.effort}`);
  if (Array.isArray(payload?.tools)) {
    const strict = payload.tools.map((tool) => (tool.function ?? tool).strict);
    details.push(`tools=${payload.tools.length}`);
    if (strict.some((value) => value === null)) details.push(`strict=null`);
  }
  console.log([
    `${start + offset + 1}`,
    entry.method,
    `${url.pathname}${url.search}`,
    auth ? `auth=${auth}` : "auth=none",
    ...details,
  ].join(" "));
}
