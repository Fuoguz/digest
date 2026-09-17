import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
const buckets = new Map();
const hash = (value, secret) =>
  createHmac("sha256", secret).update(value).digest("hex");
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function sessionValid(cookie, secret, now = Date.now()) {
  if (!secret || secret.length < 16) return false;
  const token = /(?:^|;\s*)digest_pilot=([^;]+)/.exec(cookie || "")?.[1] || "";
  const [expires, nonce, signature] = token.split(".");
  return (
    /^\d+$/.test(expires || "") &&
    Number(expires) > now &&
    Number(expires) <= now + 86400000 &&
    /^[a-f0-9]{32}$/.test(nonce || "") &&
    equal(signature, hash(expires + "." + nonce, secret))
  );
}
export function rateAllowed(key, limit, now = Date.now()) {
  for (const [k, v] of buckets) if (now - v.start > 60000) buckets.delete(k);
  if (buckets.size > 2000 && !buckets.has(key)) return false;
  const value = buckets.get(key) || { start: now, count: 0 };
  value.count++;
  buckets.set(key, value);
  return value.count <= limit;
}
export function validateMessages(body) {
  if (
    !body ||
    Object.keys(body).some((k) => k !== "messages") ||
    !Array.isArray(body.messages) ||
    body.messages.length < 1 ||
    body.messages.length > 6
  )
    throw Error("invalid");
  let length = 0;
  const messages = body.messages.map((m) => {
    if (
      !["system", "user", "assistant"].includes(m.role) ||
      typeof m.content !== "string"
    )
      throw Error("invalid");
    length += m.content.length;
    return { role: m.role, content: m.content };
  });
  if (length > 100000 || length === 0) throw Error("length");
  return messages;
}
export function createHandler(
  kind,
  { env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 120000 } = {},
) {
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status, code, message) =>
      res.status(status).json({ code, message });
    if (req.method !== "POST") return send(405, "method", "仅支持 POST");
    const origin = req.headers.origin;
    if (!origin || origin !== "https://" + req.headers.host)
      return send(403, "origin", "请求来源不受支持");
    if (!(req.headers["content-type"] || "").startsWith("application/json"))
      return send(415, "content_type", "需要 JSON 请求");
    const secret = env.PILOT_ACCESS_CODE;
    if (!secret || secret.length < 16)
      return send(503, "unavailable", "试用服务尚未启用，请联系邀请人");
    const ip = hash(
      String(req.headers["x-forwarded-for"] || "unknown").split(",")[0],
      secret,
    );
    if (
      !rateAllowed(
        kind === "access" ? "login:" + ip : "ai:" + ip,
        kind === "access" ? 5 : 8,
      )
    )
      return send(429, "rate_limit", "操作过于频繁，请一分钟后重试");
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      return send(400, "invalid_request", "请求格式不正确");
    }
    if (kind === "access") {
      if (
        typeof body?.code !== "string" ||
        body.code.length > 256 ||
        !equal(hash(body.code, secret), hash(secret, secret))
      )
        return send(401, "unauthorized", "试用码不正确");
      const value =
        String(Date.now() + 86400000) + "." + randomBytes(16).toString("hex");
      res.setHeader(
        "Set-Cookie",
        "digest_pilot=" +
          value +
          "." +
          hash(value, secret) +
          "; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=86400",
      );
      return res.status(200).json({ ok: true });
    }
    if (!sessionValid(req.headers.cookie, secret))
      return send(401, "unauthorized", "请输入邀请人提供的试用码");
    let messages;
    try {
      messages = validateMessages(body);
    } catch {
      return send(
        400,
        "invalid_request",
        "资料或请求过长（上限 100,000 字符），请拆分资料后重试",
      );
    }
    if (!env.MODEL_API_KEY || !env.MODEL_API_BASE_URL || !env.MODEL_NAME)
      return send(503, "unavailable", "AI 服务尚未配置，请联系邀请人");
    let upstream;
    try {
      upstream = new URL(env.MODEL_API_BASE_URL);
      if (
        upstream.protocol !== "https:" ||
        upstream.username ||
        upstream.password ||
        upstream.search ||
        upstream.hash
      )
        throw Error();
      upstream.pathname = upstream.pathname.replace(/\/$/, "");
      if (!upstream.pathname.endsWith("/chat/completions"))
        upstream.pathname += "/chat/completions";
    } catch {
      return send(503, "unavailable", "AI 服务配置不可用，请联系邀请人");
    }
    if (!rateAllowed("total", 60))
      return send(429, "rate_limit", "试用服务繁忙，请稍后重试");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const request = (includeResponseFormat) =>
        fetchImpl(upstream, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + env.MODEL_API_KEY,
          },
          body: JSON.stringify({
            model: env.MODEL_NAME,
            messages,
            ...(includeResponseFormat
              ? { response_format: { type: "json_object" } }
              : {}),
            temperature: 0.2,
            max_tokens: 6000,
          }),
        });
      let response = await request(true);
      if ([400, 422].includes(response.status)) {
        console.warn(
          JSON.stringify({
            event: "model_format_retry",
            kind,
            upstreamStatus: response.status,
          }),
        );
        response = await request(false);
      }
      if (!response.ok) {
        console.warn(
          JSON.stringify({
            event: "model_upstream_rejected",
            kind,
            upstreamStatus: response.status,
          }),
        );
        const message =
          response.status === 401 || response.status === 403
            ? "模型服务拒绝了凭据或模型权限，请联系试用邀请人检查服务配置。"
            : response.status === 404
              ? "模型服务未找到当前模型或接口，请联系试用邀请人检查模型名称。"
              : response.status === 429
                ? "模型服务额度不足或请求过于频繁，请稍后重试。"
                : "模型服务拒绝了当前请求，请联系试用邀请人检查模型兼容性。";
        return send(502, "upstream", message);
      }
      let data;
      try {
        data = await response.json();
      } catch {
        console.warn(JSON.stringify({ event: "model_invalid_json", kind }));
        return send(
          502,
          "upstream",
          "模型服务返回了无法读取的内容，请稍后重试。",
        );
      }
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim() || text.length > 100000) {
        console.warn(JSON.stringify({ event: "model_empty_content", kind }));
        return send(502, "upstream", "模型服务没有返回可用内容，请稍后重试。");
      }
      // Never return upstream envelopes, headers or diagnostics.
      if (text.includes(env.MODEL_API_KEY) || text.includes(secret))
        return send(502, "upstream", "AI 返回结果不可用，请重试");
      return res.status(200).json({ text });
    } catch {
      return send(
        controller.signal.aborted ? 504 : 502,
        controller.signal.aborted ? "timeout" : "upstream",
        controller.signal.aborted
          ? "模型服务未在限定时间内完成响应。已有研读结果保留，请稍后重试，或先用较短资料检查服务。"
          : "服务器连接模型服务失败，或模型返回了无法读取的响应。已有研读结果保留，请联系试用邀请人检查服务。",
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
