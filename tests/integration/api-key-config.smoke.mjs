import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const store = new Map();

globalThis.window = { DIGEST_API_KEY: "" };
globalThis.document = {
  querySelector() {
    return null;
  }
};
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  }
};

const configUrl = `${pathToFileURL(resolve(root, "src/app/config.js")).href}?api-key-smoke=${Date.now()}`;
const { clearApiKey, resolveApiKey, saveApiKey } = await import(configUrl);

assert(resolveApiKey() === "", "resolveApiKey should start empty in the smoke environment");
assert(saveApiKey(" demo-key "), "saveApiKey should persist a non-empty key");
assert(resolveApiKey() === "demo-key", "resolveApiKey should read the saved API Key");
assert(globalThis.window.DIGEST_API_KEY === "demo-key", "saveApiKey should update the current page runtime key");

clearApiKey();
assert(resolveApiKey() === "", "clearApiKey should remove the saved API Key");

console.log("api-key-config smoke passed");
