import test from "node:test";
import assert from "node:assert/strict";
import { ProxyTransport } from "../../src/ai/proxy-transport.js";
const messages = [{ role: "user", content: "test" }];
test("Proxy transport uses same-origin credentials and does not transmit any model key", async () => {
  let options;
  const transport = new ProxyTransport("digest", {
    fetchImpl: async (url, init) => {
      assert.equal(url, "/api/digest");
      options = init;
      return { ok: true, json: async () => ({ text: "{}" }) };
    },
  });
  assert.equal(await transport.request(messages), "{}");
  assert.equal(options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(options.body), { messages });
  assert.equal(options.headers.Authorization, undefined);
});
test("Proxy transport reports 429, 5xx, empty, malformed and network failures", async () => {
  for (const status of [429, 500, 502, 504]) {
    const transport = new ProxyTransport("digest", {
      fetchImpl: async () => ({
        ok: false,
        status,
        json: async () => ({ code: "upstream", message: "safe message" }),
      }),
    });
    await assert.rejects(transport.request(messages), /safe message/);
  }
  for (const result of [{ text: "" }, {}, { text: "   " }])
    await assert.rejects(
      new ProxyTransport("digest", {
        fetchImpl: async () => ({ ok: true, json: async () => result }),
      }).request(messages),
      (e) => e.code === "empty_result",
    );
  await assert.rejects(
    new ProxyTransport("digest", {
      fetchImpl: async () => {
        throw Error("offline");
      },
    }).request(messages),
    (e) => e.code === "network_error",
  );
  await assert.rejects(
    new ProxyTransport("digest", {
      fetchImpl: async () => ({
        ok: true,
        json: async () => {
          throw Error("invalid json");
        },
      }),
    }).request(messages),
    (e) => e.code === "invalid_response",
  );
});
test("Proxy transport has a bounded deadline and preserves explicit cancellation", async () => {
  const fetchImpl = (_, { signal }) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("cancelled", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  await assert.rejects(
    new ProxyTransport("digest", { timeoutMs: 3, fetchImpl }).request(messages),
    (e) => e.code === "timeout",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    new ProxyTransport("digest", { fetchImpl }).request(messages, {
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
});
