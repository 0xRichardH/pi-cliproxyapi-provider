import type { CpaModel } from "./cpa.ts";
import type { ModelsDevCatalog, ModelsDevMetadata } from "./types.ts";

const CANONICAL_OWNER_PREFIXES: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  deepseek: "deepseek",
  mistral: "mistral",
  xai: "xai",
  zhipuai: "zhipuai",
  alibaba: "alibaba",
  moonshotai: "moonshotai",
  minimax: "minimax",
  nvidia: "nvidia",
  cohere: "cohere",
};

export type MetadataMatchMethod = "alias" | "exact" | "owner-prefix" | "suffix" | "normalized-suffix";

export interface MetadataMatch {
  metadataId: string;
  metadata: ModelsDevMetadata;
  method: MetadataMatchMethod;
}

export function normalizeModelName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function oneMatch(candidates: string[]): string | undefined {
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : undefined;
}

export function findMetadataMatch(
  cpaModel: Pick<CpaModel, "id" | "owned_by">,
  catalog: ModelsDevCatalog,
  aliases: Record<string, string>,
): MetadataMatch | undefined {
  const alias = aliases[cpaModel.id];
  if (alias && catalog[alias]) {
    return { metadataId: alias, metadata: catalog[alias], method: "alias" };
  }

  if (catalog[cpaModel.id]) {
    return { metadataId: cpaModel.id, metadata: catalog[cpaModel.id], method: "exact" };
  }

  const owner = cpaModel.owned_by?.trim().toLowerCase();
  const canonicalOwner = owner ? CANONICAL_OWNER_PREFIXES[owner] : undefined;
  if (canonicalOwner) {
    const ownerKey = `${canonicalOwner}/${cpaModel.id}`;
    if (catalog[ownerKey]) {
      return { metadataId: ownerKey, metadata: catalog[ownerKey], method: "owner-prefix" };
    }
  }

  const suffixKey = oneMatch(Object.keys(catalog).filter((key) => key.endsWith(`/${cpaModel.id}`)));
  if (suffixKey) {
    return { metadataId: suffixKey, metadata: catalog[suffixKey], method: "suffix" };
  }

  const normalizedId = normalizeModelName(cpaModel.id);
  const normalizedSuffixKey = oneMatch(
    Object.keys(catalog).filter((key) => normalizeModelName(key.split("/").at(-1) ?? key) === normalizedId),
  );
  if (normalizedSuffixKey) {
    return { metadataId: normalizedSuffixKey, metadata: catalog[normalizedSuffixKey], method: "normalized-suffix" };
  }

  return undefined;
}
