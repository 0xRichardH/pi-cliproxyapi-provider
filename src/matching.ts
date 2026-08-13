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

export type MetadataMatchMethod = "alias" | "exact" | "owner-prefix" | "owner-hint" | "suffix" | "normalized-suffix" | "provider-fallback";

export interface MetadataMatch {
  metadataId: string;
  metadata: ModelsDevMetadata;
  method: MetadataMatchMethod;
}

export function normalizeModelName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function metadataModelName(metadataId: string, metadata: ModelsDevMetadata): string {
  return metadata.id.split("/").at(-1) ?? metadataId.split("/").at(-1) ?? metadataId;
}

function oneMatch(candidates: string[]): string | undefined {
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : undefined;
}

function identifierTokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function containsContiguousTokens(container: string[], sequence: string[]): boolean {
  if (sequence.length === 0 || sequence.length > container.length) return false;
  return container.some((_, start) =>
    start + sequence.length <= container.length &&
    sequence.every((token, offset) => container[start + offset] === token)
  );
}

function sourceProvider(metadataId: string, metadata: ModelsDevMetadata): string {
  // sourceProvider is retained by current catalog snapshots. The prefix fallback
  // keeps older bundled/cache snapshots useful until they are refreshed.
  return metadata.sourceProvider ?? metadataId.split("/")[0] ?? metadataId;
}

function ownerHintMatch(
  owner: string | undefined,
  candidates: string[],
  catalog: ModelsDevCatalog,
): string | undefined {
  if (!owner) return undefined;
  const ownerTokens = identifierTokens(owner);
  const matches = candidates.flatMap((metadataId) => {
    const metadata = catalog[metadataId];
    if (!metadata) return [];
    const provider = sourceProvider(metadataId, metadata);
    const providerTokens = identifierTokens(provider);
    if (!containsContiguousTokens(ownerTokens, providerTokens)) return [];
    return [{ metadataId, tokenCount: providerTokens.length, characterCount: provider.length }];
  });
  if (matches.length === 0) return undefined;

  const bestTokenCount = Math.max(...matches.map((match) => match.tokenCount));
  const mostTokens = matches.filter((match) => match.tokenCount === bestTokenCount);
  const bestCharacterCount = Math.max(...mostTokens.map((match) => match.characterCount));
  return oneMatch(
    mostTokens
      .filter((match) => match.characterCount === bestCharacterCount)
      .map((match) => match.metadataId),
  );
}

export function findMetadataMatch(
  cpaModel: Pick<CpaModel, "id" | "owned_by">,
  catalog: ModelsDevCatalog,
  aliases: Record<string, string>,
  fallbackProvider?: string | null,
): MetadataMatch | undefined {
  const alias = aliases[cpaModel.id];
  if (alias && catalog[alias]) {
    return { metadataId: alias, metadata: catalog[alias], method: "alias" };
  }

  if (catalog[cpaModel.id]) {
    return { metadataId: cpaModel.id, metadata: catalog[cpaModel.id], method: "exact" };
  }

  const catalogKeys = Object.keys(catalog);
  const exactMetadataCandidates = catalogKeys.filter((key) => catalog[key]?.id === cpaModel.id);
  const exactMetadataKey = oneMatch(exactMetadataCandidates);
  if (exactMetadataKey) {
    return { metadataId: exactMetadataKey, metadata: catalog[exactMetadataKey], method: "exact" };
  }

  const suffixCandidates = catalogKeys.filter((key) =>
    metadataModelName(key, catalog[key]) === cpaModel.id
  );
  const normalizedId = normalizeModelName(cpaModel.id);
  const normalizedSuffixCandidates = catalogKeys.filter(
    (key) => normalizeModelName(metadataModelName(key, catalog[key])) === normalizedId,
  );
  const owner = cpaModel.owned_by?.trim().toLowerCase();
  const canonicalOwner = owner ? CANONICAL_OWNER_PREFIXES[owner] : undefined;
  if (canonicalOwner) {
    const ownerKey = `${canonicalOwner}/${cpaModel.id}`;
    if (catalog[ownerKey]) {
      return { metadataId: ownerKey, metadata: catalog[ownerKey], method: "owner-prefix" };
    }
  }

  const hintedKey = ownerHintMatch(owner, normalizedSuffixCandidates, catalog);
  if (hintedKey) {
    return { metadataId: hintedKey, metadata: catalog[hintedKey], method: "owner-hint" };
  }

  const suffixKey = oneMatch(suffixCandidates);
  if (suffixKey) {
    return { metadataId: suffixKey, metadata: catalog[suffixKey], method: "suffix" };
  }

  const normalizedSuffixKey = oneMatch(normalizedSuffixCandidates);
  if (normalizedSuffixKey) {
    return { metadataId: normalizedSuffixKey, metadata: catalog[normalizedSuffixKey], method: "normalized-suffix" };
  }

  if (fallbackProvider) {
    const normalizedFallbackProvider = fallbackProvider.trim().toLowerCase();
    const fallbackKey = oneMatch(normalizedSuffixCandidates.filter((metadataId) => {
      const metadata = catalog[metadataId];
      return metadata && sourceProvider(metadataId, metadata).toLowerCase() === normalizedFallbackProvider;
    }));
    if (fallbackKey) {
      return { metadataId: fallbackKey, metadata: catalog[fallbackKey], method: "provider-fallback" };
    }
  }

  return undefined;
}
