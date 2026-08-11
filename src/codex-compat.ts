import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isResponsesModel(
  model: Pick<NonNullable<ExtensionContext["model"]>, "provider" | "api"> | null | undefined,
  providerName: string,
): boolean {
  return model?.provider.trim().toLowerCase() === providerName.trim().toLowerCase()
    && model.api.toLowerCase().includes("responses");
}

/**
 * Match the Codex-compatible Responses wire contract used by
 * pi-codex-conversion: function tools explicitly publish `strict: null`.
 * Generic OpenAI Responses omits the field when strict mode is unsupported,
 * which does not preserve optional argument behavior for Codex-like models.
 */
export function rewriteCodexCompatibleToolPayload(
  payload: unknown,
  model: Pick<NonNullable<ExtensionContext["model"]>, "provider" | "api"> | null | undefined,
  providerName: string,
): unknown | undefined {
  if (!isResponsesModel(model, providerName) || !isRecord(payload) || !Array.isArray(payload.tools)) {
    return undefined;
  }

  let changed = false;
  const tools = payload.tools.map((tool) => {
    if (!isRecord(tool) || tool.type !== "function" || tool.strict === null) return tool;
    changed = true;
    return { ...tool, strict: null };
  });

  return changed ? { ...payload, tools } : undefined;
}

export function registerCodexCompatiblePayloadAdapter(pi: ExtensionAPI, providerName: string): void {
  pi.on("before_provider_request", (event, ctx) =>
    rewriteCodexCompatibleToolPayload(event.payload, ctx.model, providerName));
}
