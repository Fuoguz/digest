export const MODE_SECTIONS = Object.freeze({
  general: {
    summary: "摘要",
    mainPoints: "核心观点",
    arguments: "论据",
    framework: "思考框架",
  },
  academic_paper: {
    researchQuestion: "研究问题",
    method: "研究方法",
    findings: "主要发现",
    evidence: "研究证据",
    limitations: "研究局限",
    reusableInsights: "可复用洞见",
  },
  legal_case: {
    facts: "案件事实",
    legalIssues: "法律争点",
    rules: "适用规则",
    arguments: "各方主张",
    reasoning: "裁判推理",
    holding: "裁判结论",
  },
  policy_document: {
    background: "政策背景",
    targetAudience: "适用对象",
    objectives: "政策目标",
    measures: "主要措施",
    responsibleActors: "责任主体",
    timeline: "实施时间",
    implications: "影响与启示",
  },
});
export const CLAIM_KINDS = {
  source_statement: "资料陈述",
  inference: "AI 推论",
  reusable_insight: "可复用洞见",
};

const nonempty = (value) =>
  typeof value === "string" && value.trim().length > 0;
export class AnalysisError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AnalysisError";
    this.code = code;
  }
}

// Runtime validator returns a clean object, dropping all model-supplied offsets,
// IDs for anchors and validationStatus, even when the model claims "matched".
export function validateReadingOutput(input, mode) {
  const fail = (message) => {
    throw new AnalysisError("schema_invalid", message);
  };
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("结果必须是 JSON 对象。");
  if (input.readingMode !== mode || !MODE_SECTIONS[mode])
    fail("研读模式不匹配。");
  if (!input.sections || typeof input.sections !== "object")
    fail("缺少 sections。");
  const sections = {};
  const ids = new Set();
  let count = 0;
  for (const name of Object.keys(MODE_SECTIONS[mode])) {
    const section = input.sections[name];
    if (
      !section ||
      !["ready", "missing"].includes(section.status) ||
      !Array.isArray(section.items)
    )
      fail(name + " 结构无效。");
    if (section.items.length > 30) fail(name + " 判断过多。");
    if (
      section.status === "missing" &&
      (section.items.length || !nonempty(section.missingReason))
    )
      fail(name + " 缺失时需说明材料不足原因。");
    if (section.status === "ready" && !section.items.length)
      fail(name + " 不可用空数组伪装完成。");
    const items = section.items.map((claim) => {
      if (
        !claim ||
        !nonempty(claim.id) ||
        ids.has(claim.id) ||
        !nonempty(claim.text) ||
        claim.text.length > 12000 ||
        !Object.hasOwn(CLAIM_KINDS, claim.kind)
      )
        fail("Claim 内容、类型或 id 无效。");
      if (!Array.isArray(claim.evidence) || claim.evidence.length > 12)
        fail("Claim evidence 必须是建议数组。");
      ids.add(claim.id);
      count++;
      // Malformed proposals remain invalid evidence instead of repairing quotations.
      return {
        id: claim.id,
        text: claim.text,
        kind: claim.kind,
        knowledgeLabel:
          typeof claim.knowledgeLabel === "string"
            ? claim.knowledgeLabel.trim().slice(0, 100)
            : null,
        evidence: claim.evidence.map((proposal) => ({
          paragraphIndex: Number.isInteger(proposal?.paragraphIndex)
            ? proposal.paragraphIndex
            : null,
          quote: typeof proposal?.quote === "string" ? proposal.quote : "",
        })),
      };
    });
    sections[name] = {
      status: section.status,
      items,
      missingReason:
        section.status === "missing" ? section.missingReason : null,
    };
  }
  if (!count)
    throw new AnalysisError(
      "empty_result",
      "没有可用的研读判断，请补充资料后重试。",
    );
  if (
    !Array.isArray(input.reviewQuestions) ||
    input.reviewQuestions.length > 20
  )
    fail("reviewQuestions 必须是数组。");
  const reviewQuestions = input.reviewQuestions.map((item) => {
    if (!nonempty(item?.question) || !nonempty(item?.answer))
      fail("复习问题结构无效。");
    if (
      item.claimIds !== undefined &&
      (!Array.isArray(item.claimIds) ||
        item.claimIds.some((id) => !ids.has(id)))
    )
      fail("复习题关联的判断不存在。");
    return {
      question: item.question,
      answer: item.answer,
      claimIds: item.claimIds || [],
    };
  });
  return { readingMode: mode, sections, reviewQuestions };
}

export function parseReadingOutput(text, mode) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AnalysisError("invalid_json", "AI 未返回有效 JSON。");
  }
  return validateReadingOutput(value, mode);
}
