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

function writeStorageValue(key, value) {
  try {
    localStorage.setItem(key, String(value || "").trim());
    return true;
  } catch (error) {
    return false;
  }
}

function removeStorageValue(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    return false;
  }
}

export function resolveApiKey() {
  const fromWindow = String(window.DIGEST_API_KEY || "").trim();
  const fromMeta = readMetaContent("digest-api-key");
  const fromStorage = readStorageValue("digest_api_key");
  return fromWindow || fromMeta || fromStorage || "";
}

export function saveApiKey(apiKey) {
  const normalized = String(apiKey || "").trim();
  if (!normalized) {
    return false;
  }

  window.DIGEST_API_KEY = normalized;
  return writeStorageValue("digest_api_key", normalized);
}

export function clearApiKey() {
  window.DIGEST_API_KEY = "";
  return removeStorageValue("digest_api_key");
}

export function getAgentRuntimeConfig() {
  return {
    apiKey: resolveApiKey(),
    endpoint: String(window.DIGEST_API_ENDPOINT || "").trim() || undefined,
    model: String(window.DIGEST_MODEL || "").trim() || undefined,
    maxTurns: Number(window.DIGEST_AGENT_MAX_TURNS) || undefined
  };
}
