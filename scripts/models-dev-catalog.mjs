export function normalizeModelsDevCatalog(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("models.dev catalog must be a JSON object");
  }

  const catalog = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!value || typeof value !== "object") continue;
    if (typeof value.id === "string") {
      catalog[key] = { ...value, id: value.id.includes("/") ? value.id : key };
      continue;
    }
    if (!value.models || typeof value.models !== "object") continue;
    for (const [modelId, metadata] of Object.entries(value.models)) {
      if (!metadata || typeof metadata !== "object" || typeof metadata.id !== "string") continue;
      const canonicalId = metadata.id.includes("/") ? metadata.id : `${key}/${modelId}`;
      catalog[canonicalId] = { ...metadata, id: canonicalId };
    }
  }

  const entries = Object.entries(catalog).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length < 100) {
    throw new Error(`models.dev catalog contained only ${entries.length} valid models; refusing to replace the fallback`);
  }
  return Object.fromEntries(entries);
}

export function validateCatalogSize(currentCatalog, nextCatalog) {
  const currentCount = Object.keys(currentCatalog).length;
  const nextCount = Object.keys(nextCatalog).length;
  if (currentCount > 0 && nextCount < currentCount * 0.5) {
    throw new Error(`models.dev catalog shrank from ${currentCount} to ${nextCount} models; refusing the update`);
  }
}
