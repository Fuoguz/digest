// Opt-in bounded release-candidate acceptance. Private inputs/results stay ignored.
import fs from "node:fs";
import { chromium } from "playwright";
import { createDocument } from "../../src/domain/documents.js";
import {
  prepareFeedbackContext,
  feedbackMessages,
  generateFeedback,
} from "../../src/domain/training.js";
import { deriveGaps } from "../../src/domain/gaps.js";
import {
  challengeMessages,
  validateChallenge,
  retestMessages,
  validateRetest,
} from "../../src/ai/learning-loop.js";
if (process.env.DIGEST_RC_REAL !== "1")
  throw Error("Opt in with DIGEST_RC_REAL=1; bounded paid QA");
const out = "qa-artifacts/v03-rc",
  access = JSON.parse(fs.readFileSync(out + "/transport.json"));
const supported =
  "议程设置指媒体通过议题选择和报道频率，影响公众认为哪些议题重要。不能仅凭报道增多推断公众赞成某政策，也不能据此声称媒体直接决定公众立场。\n\n框架指对同一个问题采用不同解释角度，例如把交通政策呈现为公共健康问题，或呈现为个人成本问题。议程设置与框架可以同时出现，但不是同一个机制。\n\n材料只阐述概念，不含任何效果百分比、实验结果或公众态度调查。";
export const cases = [
  {
    id: "A-absent",
    material:
      "课程资料说明：本周在周三讨论传播案例，下周提交一篇800字短文。没有提供传播理论内容。",
    prompt: "解释心理抗拒为什么可能使强制说服产生反效果。",
    answer:
      "强制语气可能被理解为限制选择自由，从而引发抗拒；是否产生反效果还要看情境。这是我的理解，所给日程表没有理论依据。",
    boundary:
      "No course evidence for theory; no durable observed misconception.",
  },
  {
    id: "B-partial",
    material:
      "议程设置指媒体通过议题选择和报道频率，影响公众认为哪些议题重要。本节没有讨论框架理论。",
    prompt: "比较议程设置与框架的作用。",
    answer:
      "议程设置涉及哪些议题受到关注；框架涉及解释一个议题的角度。材料支持前半句，后半句是我另学的概念，目前资料没有覆盖。",
    boundary: "Agenda part supported; framing not established, not disproved.",
  },
  {
    id: "C-similar",
    material:
      "本节讨论议程设置：报道某议题越频繁，公众越可能认为该议题重要。此处未研究报道角度、态度转变或具体政策支持。",
    prompt: "评估把交通政策呈现为公共健康问题是否一定提升政策支持度。",
    answer:
      "这样的健康角度可能影响读者如何理解政策，但不能仅凭角度就断言支持提升。本材料的报道频率概念不足以验证这个具体效果。",
    boundary:
      "Related agenda evidence cannot establish attitude/framing effect or prove this cautious answer wrong.",
  },
  {
    id: "D-general-knowledge",
    material:
      "植物需要水、光照和适当养分。本文只谈盆栽照护，没有介绍化学式、元素原子量或离子计算。",
    prompt: "硝酸根NO3−的相对质量是多少？请根据课程材料核查。",
    answer:
      "常见计算为14+3×16=62；这是我已有的化学知识，不是这份盆栽材料给出的信息。材料不足以核查计算。",
    boundary:
      "Model knows 62, course does not; no fabricated course-backed chemistry correction.",
  },
  {
    id: "R1-reasonable",
    material: supported,
    prompt: "解释议程设置与框架的区别，以及报道量能否推出公众支持。",
    answer:
      "两者可以同时发生：曝光频率可能使议题更显眼，采用健康或成本角度则影响解读。真正的态度效果仍需调查，不能说报道增多就必然赞成。",
    boundary: "Reasonable equivalent wording; no forced gap.",
  },
  {
    id: "R2-defensible",
    material:
      "课程讨论两种可辩护立场：公共健康立场强调减少伤害；个人自主立场强调选择权。评价论证时应说明立场与限制，而不是只选固定结论。",
    prompt: "是否应该限制含糖饮料广告？根据材料提出一个有理由的立场。",
    answer:
      "我倾向有限限制面向儿童的广告，因为儿童自主判断能力尚在发展；对成年人则保留选择权。材料提供价值权衡而非唯一政策答案，具体效果仍需证据。",
    boundary:
      "Different defensible answer accepted; no canonical stance demanded.",
  },
  {
    id: "R3-ambiguous",
    material:
      "报道频率常常与公众议题重要性的判断有关，但效果可能因受众和情境而异。这里没有给出固定效果大小或必要条件。",
    prompt: "如何理解报道频率与议题重要性的关系？",
    answer:
      "我把它理解为一种可能的影响，而不是每个人都会变化的保证。材料里的“常常”和“可能”保留了受众和情境差异，我不能推出固定效果。",
    boundary: "Ambiguity should not be turned into categorical correction.",
  },
  {
    id: "R4-misread",
    material: supported,
    prompt: "解释议程设置与框架，说明不能推出的结论。",
    answer:
      "媒体会引导人们的看法——这里我指注意哪些议题或从哪个角度理解，不是说它能直接决定支持或反对。报道频率涉及关注，呈现角度涉及框架，立场变化另需验证。",
    boundary:
      "Read qualifying second clause; do not isolate first ambiguous phrase.",
  },
  {
    id: "R5-locatable-not-proof",
    material:
      "某校园观察发现参与学习小组的学生平均成绩较高。这是描述性关联，没有随机分组，也没有控制既往成绩或学习投入。",
    prompt: "这项观察能够说明什么？",
    answer:
      "参与学习小组与较高成绩在这份观察中相关；但可能是本来更投入的人愿意参加，所以不能由此认定小组造成成绩提高，更不能给每个人承诺效果。",
    boundary:
      "An exact association quote cannot prove a cautious causal interpretation wrong.",
  },
];
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  ...(process.env.HTTPS_PROXY
    ? { proxy: { server: process.env.HTTPS_PROXY } }
    : {}),
});
const ctx = await browser.newContext({
  extraHTTPHeaders: { "x-vercel-protection-bypass": access.secret },
});
await ctx.addCookies([
  {
    name: "digest_pilot",
    value: access.cookie.split("digest_pilot=")[1],
    url: access.base,
  },
]);
const page = await ctx.newPage();
await page.goto(access.base + "/app/");
let lastStart = 0;
const records = fs.existsSync(out + "/reliability.json")
  ? JSON.parse(fs.readFileSync(out + "/reliability.json"))
  : [];
async function request(name, type, messages) {
  const f = out + "/" + name;
  fs.writeFileSync(f + "-request.json", JSON.stringify({ messages }, null, 2));
  if (fs.existsSync(f + "-response.json")) {
    const cached = JSON.parse(fs.readFileSync(f + "-response.json"));
    if (cached.text) return cached.text;
  }
  if (Date.now() - lastStart < 8500)
    await new Promise((r) => setTimeout(r, 8500 - (Date.now() - lastStart)));
  lastStart = Date.now();
  const start = lastStart;
  try {
    const response = await page.evaluate(async (messages) => {
      const r = await fetch("/api/digest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Digest-Keepalive": "1",
        },
        body: JSON.stringify({ messages }),
        signal: AbortSignal.timeout(175000),
      });
      return { status: r.status, body: await r.text() };
    }, messages);
    const body = JSON.parse(response.body);
    fs.writeFileSync(f + "-response.json", JSON.stringify(body, null, 2));
    const status = body.httpStatus || response.status;
    records.push({
      name,
      type,
      status,
      code: body.code,
      latencyMs: Date.now() - start,
      success: status === 200 && !!body.text,
    });
    if (status >= 400 || !body.text) throw Error(body.code || "No output");
    console.log(
      "RECEIVED",
      name,
      Math.round((Date.now() - start) / 1000) + "s",
    );
    return body.text;
  } catch (e) {
    if (
      !records.some(
        (r) => r.name === name && r.latencyMs === Date.now() - start,
      )
    ) {
    }
    if (records.at(-1)?.name !== name)
      records.push({
        name,
        type,
        error: e.message,
        latencyMs: Date.now() - start,
        success: false,
      });
    console.log("FAILED", name, e.message);
    throw e;
  } finally {
    fs.writeFileSync(
      out + "/reliability.json",
      JSON.stringify(records, null, 2),
    );
  }
}
async function contextFor(c) {
  const doc = createDocument({
    id: "rc-doc-" + c.id,
    title: c.id,
    rawContent: c.material,
  });
  const task = {
    id: "rc-task-" + c.id,
    courseId: "rc-course",
    title: c.id,
    prompt: c.prompt,
    documentIds: [doc.id],
    version: 1,
  };
  const context = await prepareFeedbackContext(
    task,
    { id: "rc-course", title: "RC controlled acceptance" },
    [doc],
    c.answer,
  );
  context.outputLanguage = "zh-CN";
  return context;
}
try {
  const phase = process.env.DIGEST_RC_PHASE || "feedback";
  if (phase === "feedback")
    for (const c of cases) {
      if (process.env.DIGEST_RC_ONLY && c.id !== process.env.DIGEST_RC_ONLY)
        continue;
      const context = await contextFor(c);
      try {
        const raw = await request(
          c.id + "-feedback",
          "feedback",
          feedbackMessages(context),
        );
        const payload = await generateFeedback(
          context,
          { request: async () => raw },
          c.id,
        );
        const gaps = deriveGaps(
          {
            id: "rc-attempt-" + c.id,
            taskId: context.task.id,
            courseId: context.course.id,
            userAnswer: c.answer,
          },
          payload.feedback,
          payload.anchors,
        );
        const result = { case: c, payload, gaps };
        fs.writeFileSync(
          out + "/" + c.id + "-validated.json",
          JSON.stringify(result, null, 2),
        );
        console.log(
          "VALIDATED",
          c.id,
          JSON.stringify({
            overall: payload.feedback.overall,
            gaps: gaps.map((g) => ({
              status: g.status,
              description: g.description,
            })),
          }),
        );
      } catch {}
    }
  if (phase === "insufficient")
    for (const c of cases.slice(0, 4)) {
      const context = await contextFor(c),
        observed = JSON.parse(
          fs.readFileSync(out + "/" + c.id + "-validated.json"),
        );
      const gap = {
        id: "rc-boundary-" + c.id,
        description: "课程材料不足以核查这项回答，不能确定用户理解错误。",
        kind: "unsupported_inference",
        status: "inconclusive",
      };
      const attempt = { userAnswer: c.answer, revision: [] };
      try {
        const raw = await request(
          c.id + "-challenge",
          "challenge",
          challengeMessages(context, gap, attempt, observed.payload.feedback),
        );
        let candidate, error;
        try {
          candidate = validateChallenge(raw, context, gap);
        } catch (e) {
          error = e.message;
        }
        fs.writeFileSync(
          out + "/" + c.id + "-challenge-validated.json",
          JSON.stringify({ candidate, error, raw: JSON.parse(raw) }, null, 2),
        );
      } catch {}
      try {
        const raw = await request(
          c.id + "-retest",
          "retest",
          retestMessages(context, gap, {
            rationale:
              "Boundary test: this material cannot establish the targeted outside claim.",
          }),
        );
        const result = validateRetest(raw, context, c.id + "-retest");
        fs.writeFileSync(
          out + "/" + c.id + "-retest-validated.json",
          JSON.stringify(result, null, 2),
        );
        console.log("RETEST", c.id, result.outcome);
      } catch {}
    }
  if (phase === "transfer") {
    const doc = createDocument({
        id: "rc-transfer-doc",
        title: "Agenda-setting and framing",
        rawContent: supported,
      }),
      task = {
        id: "rc-original",
        courseId: "rc-course",
        title: "区分机制",
        prompt:
          "解释议程设置与框架的区别，并说明为什么不能仅凭报道数量推断公众支持。",
        documentIds: [doc.id],
        version: 1,
      },
      answer =
        "议程设置就是媒体告诉大家必须持有什么观点。框架与议程设置完全相同，只要报道增多，公众必然支持。";
    const context = await prepareFeedbackContext(
      task,
      { id: "rc-course", title: "传播学" },
      [doc],
      answer,
    );
    context.outputLanguage = "zh-CN";
    const attempt = {
        userAnswer: answer,
        revision: [
          {
            userAnswer:
              "报道频率影响议题关注，解释角度涉及框架；二者不能等同，报道量不能直接证明态度支持。",
          },
        ],
      },
      feedback = { overall: "概念边界与态度推断需要检验。" },
      gap = {
        id: "rc-transfer-gap",
        description:
          "把媒体对议题关注的影响等同于直接决定公众的态度；混淆报道频率与解释角度。",
        kind: "boundary_confusion",
      };
    for (let i = 1; i <= 5; i++)
      try {
        const name = "transfer-" + i,
          raw = await request(
            name,
            "challenge",
            challengeMessages(context, gap, attempt, feedback),
          );
        let challenge, error;
        try {
          challenge = validateChallenge(raw, context, gap);
        } catch (e) {
          error = e.message;
        }
        fs.writeFileSync(
          out + "/" + name + "-validated.json",
          JSON.stringify(
            {
              originalTask: task.prompt,
              targetGap: gap,
              challenge,
              error,
              raw: JSON.parse(raw),
            },
            null,
            2,
          ),
        );
        console.log("CHALLENGE", i, challenge?.title || error);
      } catch {}
    const challenge = JSON.parse(
      fs.readFileSync(out + "/transfer-1-validated.json"),
    ).challenge;
    if (challenge) {
      const secondTask = {
        ...task,
        prompt: challenge.scenario + "\n\n" + challenge.prompt,
      };
      for (const [name, answer] of [
        [
          "semantic-resolved",
          "案例中增加报道可能提高议题关注；对同一事项采用不同解释角度则是框架。这两种机制不相同，材料不足以由报道增多推断公众必然支持，需要独立态度证据。",
        ],
        [
          "semantic-present",
          "既然报道数量增加，媒体必然决定公众必须赞成该政策，所以已经可以证明所有人支持。报道频率与解释角度就是同一件事。",
        ],
        ["semantic-inconclusive", "我觉得可能不同，但暂时不知道应该怎么判断。"],
      ])
        try {
          const c = await prepareFeedbackContext(
            secondTask,
            context.course,
            [doc],
            answer,
          );
          c.outputLanguage = "zh-CN";
          const raw = await request(
            name,
            "retest",
            retestMessages(c, gap, challenge),
          );
          fs.writeFileSync(
            out + "/" + name + "-validated.json",
            JSON.stringify(validateRetest(raw, c, name), null, 2),
          );
        } catch {}
    }
  }
} finally {
  await browser.close();
}
