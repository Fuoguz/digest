import test from "node:test";
import assert from "node:assert/strict";
import {
  createHandler,
  sessionValid,
  validateMessages,
} from "../../pilot/handler.js";
const env = {
  PILOT_ACCESS_CODE: "fixture-access-code-long",
  MODEL_API_KEY: "fixture-server-key",
  MODEL_API_BASE_URL: "https://model.example/v1",
  MODEL_NAME: "fixture",
};
let ip = 0;
async function call(
  kind,
  body,
  {
    cookie = "",
    origin = "https://pilot.example",
    fetchImpl = async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"sections":{}}' } }],
      }),
    }),
    timeoutMs = 100,
  } = {},
) {
  let status, output;
  const headers = {};
  await createHandler(kind, { env, fetchImpl, timeoutMs })(
    {
      method: "POST",
      headers: {
        origin,
        host: "pilot.example",
        "content-type": "application/json",
        "x-forwarded-for": String(++ip),
        cookie,
      },
      body,
    },
    {
      setHeader: (k, v) => (headers[k] = v),
      status(n) {
        status = n;
        return this;
      },
      json(v) {
        output = v;
      },
    },
  );
  return { status, output, headers };
}
test("Pilot access rejects missing session, wrong code and foreign origin", async () => {
  assert.equal((await call("digest", { messages: [] })).status, 401);
  assert.equal((await call("access", { code: "wrong" })).status, 401);
  assert.equal(
    (
      await call(
        "access",
        { code: env.PILOT_ACCESS_CODE },
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
});
test("Pilot session is signed, secure, expiring and tamper resistant", async () => {
  const r = await call("access", { code: env.PILOT_ACCESS_CODE });
  const cookie = r.headers["Set-Cookie"];
  assert.equal(r.status, 200);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.ok(sessionValid(cookie, env.PILOT_ACCESS_CODE));
  assert.equal(
    sessionValid(cookie, env.PILOT_ACCESS_CODE, Date.now() + 86400001),
    false,
  );
  assert.equal(
    sessionValid(
      cookie.replace("digest_pilot=", "digest_pilot=0"),
      env.PILOT_ACCESS_CODE,
    ),
    false,
  );
});
test("Pilot proxy owns upstream config, strips envelope and does not return secrets", async () => {
  const cookie = (await call("access", { code: env.PILOT_ACCESS_CODE }))
    .headers["Set-Cookie"];
  let sent;
  const result = await call(
    "digest",
    { messages: [{ role: "user", content: "课程资料" }] },
    {
      cookie,
      fetchImpl: async (url, options) => {
        sent = { url: String(url), body: JSON.parse(options.body) };
        return {
          ok: true,
          json: async () => ({
            secret: "never-return",
            choices: [{ message: { content: "{}" } }],
          }),
        };
      },
    },
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.output, { text: "{}" });
  assert.equal(sent.url, "https://model.example/v1/chat/completions");
  assert.equal(sent.body.model, "fixture");
  assert.equal(sent.body.max_tokens, 12000);
  assert.throws(() =>
    validateMessages({ messages: [], endpoint: "https://evil.example" }),
  );
  assert.throws(() =>
    validateMessages({
      messages: [{ role: "user", content: "x".repeat(100001) }],
    }),
  );
});
test("Pilot errors redact upstream diagnostics and timeout returns 504", async () => {
  const cookie = (await call("access", { code: env.PILOT_ACCESS_CODE }))
    .headers["Set-Cookie"];
  const body = { messages: [{ role: "user", content: "test" }] };
  const failed = await call("relations", body, {
    cookie,
    fetchImpl: async () => {
      throw Error(env.MODEL_API_KEY);
    },
  });
  assert.equal(failed.status, 502);
  assert.equal(failed.output.code, "upstream");
  assert.match(failed.output.message, /连接模型服务失败/);
  assert.ok(!JSON.stringify(failed).includes(env.MODEL_API_KEY));
  const timeout = await call("digest", body, {
    cookie,
    timeoutMs: 1,
    fetchImpl: (_, o) =>
      new Promise((_, reject) =>
        o.signal.addEventListener("abort", () => reject(Error("aborted"))),
      ),
  });
  assert.equal(timeout.status, 504);
  assert.equal(timeout.output.code, "timeout");
  assert.match(timeout.output.message, /限定时间/);
});

test("Pilot retries once without response_format when compatible upstream rejects it", async () => {
  const cookie = (await call("access", { code: env.PILOT_ACCESS_CODE }))
    .headers["Set-Cookie"];
  const requests = [];
  const result = await call(
    "digest",
    { messages: [{ role: "user", content: "test" }] },
    {
      cookie,
      fetchImpl: async (_url, options) => {
        requests.push(JSON.parse(options.body));
        if (requests.length === 1)
          return { ok: false, status: 400, json: async () => ({}) };
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: "{}" } }] }),
        };
      },
    },
  );
  assert.equal(result.status, 200);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].response_format, { type: "json_object" });
  assert.equal("response_format" in requests[1], false);
});

test("Pilot retries one transient network failure and returns the recovered result", async () => {
  const cookie = (await call("access", { code: env.PILOT_ACCESS_CODE }))
    .headers["Set-Cookie"];
  let attempts = 0;
  const result = await call(
    "digest",
    { messages: [{ role: "user", content: "test" }] },
    {
      cookie,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("fetch failed");
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: "{}" } }] }),
        };
      },
    },
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.output, { text: "{}" });
  assert.equal(attempts, 2);
});

test("Pilot rate limits repeated attempts and fails closed without configuration", async () => {
  const { rateAllowed } = await import("../../pilot/handler.js");
  for (let i = 0; i < 5; i++)
    assert.equal(rateAllowed("unit-fixed-bucket", 5, 1), true);
  assert.equal(rateAllowed("unit-fixed-bucket", 5, 1), false);
  assert.equal(rateAllowed("unit-fixed-bucket", 5, 60002), true);
  let status;
  await createHandler("digest", { env: {} })(
    {
      method: "POST",
      headers: {
        origin: "https://pilot.example",
        host: "pilot.example",
        "content-type": "application/json",
      },
      body: {},
    },
    {
      setHeader() {},
      status(n) {
        status = n;
        return this;
      },
      json() {},
    },
  );
  assert.equal(status, 503);
});
