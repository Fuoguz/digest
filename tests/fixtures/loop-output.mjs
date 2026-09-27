// Explicit QA fixture, not a real model evaluation.
export function loopOutput(p) {
  if (p.workflow === "suggest_tasks_v1")
    return {
      tasks: [
        {
          title: "比较两个机制",
          prompt: "议程设置与框架分别解释什么传播过程？请用材料说明。",
          documentIds: p.documents.map((d) => d.documentId),
        },
        {
          title: "核查推论",
          prompt: "报道数量增加能够证明公众支持吗？请说明推理的适用边界。",
          documentIds: p.documents.map((d) => d.documentId),
        },
        {
          title: "应用材料",
          prompt:
            "假设同一校园问题被分别从成本和责任角度报道，如何用材料解释？",
          documentIds: p.documents.map((d) => d.documentId),
        },
      ],
    };
  if (p.workflow === "retrieval_rescue_v1")
    return { terms: ["agenda setting", "framing"] };
  if (p.workflow === "transfer_challenge_v1")
    return {
      title: "QA 校园食堂报道案例",
      prompt:
        "请区分报道数量变化和解释角度变化分别涉及什么，并说明不能推出什么结论。",
      scenario:
        "假设某校园报连续报道食堂浪费，另一栏目把同一问题分别描述为成本压力或环保责任。读者因此更关注浪费，但其立场没有被调查。",
      targetGapId: p.targetGap.id,
      documentIds: p.documents.map((d) => d.documentId),
      taskType: "case_judgment",
      difficulty: "similar",
      rationale: "检验关注议题与解释方式以及态度推论的边界。",
      originalContext: "直接解释理论定义",
      newContext: "校园食堂浪费的两种报道操作",
    };
  if (p.workflow === "targeted_retest_v1") {
    const d = p.documents[0],
      s = d.paragraphs[0];
    return {
      outcome: p.answer.includes("无法判断")
        ? "inconclusive"
        : p.answer.includes("完全相同")
          ? "still_present"
          : "resolved_once",
      reason: "QA：本次是否区分议题关注与问题解释，需要结合材料核查。",
      nextStep: "换一个案例后再检验，不能由一次表现推断长期掌握。",
      userAnswerQuote: p.answer,
      challengeAdequate: true,
      materialSufficient: true,
      evidenceCandidates: [
        {
          documentId: d.documentId,
          paragraphIndex: s.paragraphIndex,
          quoteId: s.evidenceExcerpts[0].id,
        },
      ],
    };
  }
}
