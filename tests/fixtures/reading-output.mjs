import { MODE_SECTIONS } from "../../src/ai/schema.js";

export function outputFor(snapshot, { invalid = false, long = false } = {}) {
  const paragraphs = snapshot.paragraphs;
  const names = Object.keys(MODE_SECTIONS[snapshot.readingMode]);
  const output = {
    readingMode: snapshot.readingMode,
    sections: Object.fromEntries(
      names.map((name, index) => {
        if (index === names.length - 1)
          return [
            name,
            {
              status: "missing",
              items: [],
              missingReason: "材料没有提供这一部分的信息。",
            },
          ];
        const paragraph = paragraphs[index % paragraphs.length];
        return [
          name,
          {
            status: "ready",
            missingReason: null,
            items: Array.from({ length: long ? 6 : 1 }, (_, j) => ({
              id: name + "-" + j,
              text:
                (index === 0
                  ? "以下判断用于验证研读与来源定位："
                  : "这条测试推论需要结合资料核对：") +
                paragraph.text +
                (long
                  ? "\n\n较长的研读输出应自然换行，并保留依据操作。".repeat(5)
                  : ""),
              kind: index === 0 ? "source_statement" : "inference",
              evidence: [
                {
                  paragraphIndex: paragraph.paragraphIndex,
                  quote:
                    invalid && index === 1
                      ? "这段引用并不存在于原文"
                      : paragraph.text.slice(0, 80),
                  validationStatus: "matched",
                  startOffset: 9999,
                },
              ],
            })),
          },
        ];
      }),
    ),
    reviewQuestions: [
      {
        question: "资料的主要观点是什么？",
        answer: paragraphs[0].text,
        claimIds: [names[0] + "-0"],
      },
    ],
  };
  // A selected passage: the first claim quotes its opening words (simulated, QA only).
  const focus = snapshot.focus;
  if (focus) {
    const quote = focus.text.split("\n\n")[0].trim().slice(0, 24);
    output.sections[names[0]].items[0] = {
      id: names[0] + "-0",
      text: "QA 模拟 · 选段解读：" + quote,
      kind: "source_statement",
      evidence: [{ paragraphIndex: focus.paragraphIndexes[0], quote }],
    };
  }
  return output;
}
