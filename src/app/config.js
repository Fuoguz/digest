function readMetaContent(name) {
  const meta = document.querySelector(`meta[name="${name}"]`);
  return meta?.getAttribute("content")?.trim() || "";
}

function readStorageValue(key) {
  try {
    return String(localStorage.getItem(key) || "").trim();
  } catch (error) {
    return "";
  }
}

export function resolveApiKey() {
  const fromWindow = String(window.DIGEST_API_KEY || "").trim();
  const fromMeta = readMetaContent("digest-api-key");
  const fromStorage = readStorageValue("digest_api_key");
  return fromWindow || fromMeta || fromStorage || "";
}

export function getAgentRuntimeConfig() {
  return {
    apiKey: resolveApiKey(),
    endpoint: String(window.DIGEST_API_ENDPOINT || "").trim() || undefined,
    model: String(window.DIGEST_MODEL || "").trim() || undefined,
    maxTurns: Number(window.DIGEST_AGENT_MAX_TURNS) || undefined
  };
}
