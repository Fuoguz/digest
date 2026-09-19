// Deliberately deterministic QA data, never a claim about real-model quality.
export function feedbackOutput(prompt) {
  const d = prompt.documents[0],
    p = d.paragraphs[0];
  return {
    overall: "QA 模拟反馈：已提出观点，需要区分概念并补充材料依据。",
    strengths: [
      {
        type: "提出观点",
        userAnswerQuote: prompt.userAnswer.slice(0, 24),
        explanation: "QA：你已经写出了自己的判断，可以据此核查理解。",
        support: "partially_supported",
        evidenceCandidates: [
          {
            documentId: d.documentId,
            paragraphIndex: p.paragraphIndex,
            quote: p.text.slice(0, 80),
          },
        ],
        suggestedAction: "保留自己的论点，并检查适用条件。",
      },
    ],
    gaps: [
      {
        type: "解释不足",
        userAnswerQuote: null,
        explanation:
          "QA：还需要解释材料中的概念区别，并说明案例为什么支持你的判断。",
        support: "supported",
        evidenceCandidates: [
          {
            documentId: d.documentId,
            paragraphIndex: p.paragraphIndex,
            quote: p.text.slice(0, 80),
          },
        ],
        suggestedAction: "增加一段对比解释，引用材料并说明联系。",
      },
    ],
    suggestedNextStep: "核对课程原文，再补充概念区别与具体例子。",
  };
}
