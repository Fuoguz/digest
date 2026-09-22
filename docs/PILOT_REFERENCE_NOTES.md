# Pilot reference notes — 2026-09-22

本轮只用参考资料改进验收，不引入参考项目的产品架构，不运行它们的脚本。以下是代码阅读结论，不是对其运行效果的认证。

## learn-from-materials

固定阅读版本：[c3c9d107](https://github.com/dmoshehun-prog/learn-from-materials/tree/c3c9d10786e51d27845600122d091706fa3ea142)。阅读 README、SKILL.md、references 下 coverage-audit-schema、summary-coverage-schema、answer-protocol、content-contract、learning-depth-modes，以及 scripts/verify_coverage.py、audit_reverse_coverage.py、extractor/integrity.py、extractor/parsers/pdf.py。

- coverage audit 要求来源清单、已读区间、读到末尾，以及显式记录未覆盖部分。它降低“处理成功等于全部理解”的风险。Digest 当前会发送任务范围内全部文本，超过上限拒绝；但没有内容覆盖证明，PDF 文本提取也不能证明图表/扫描页已被理解。最小措施是本轮记录输入长度、完整首尾、关键条件清单；Pilot 优先使用可核对的文本资料。
- summary coverage 从 SourceClaim 反查摘要单元，再从摘要反查来源，尤其检查条件、例外、时间和范围。本轮借鉴反向审阅方法：**先写 Critical Content Checklist，再看模型结果**。不新增 SourceClaim 表。
- verify_coverage 检查 ID、顺序、关联和标记；audit_reverse_coverage 使用确定性抽样核对映射结构。结构通过不能证明摘要忠实或语义无遗漏。Digest exact-match 同样只证明引用可定位，必须另做语义审阅。
- answer protocol 将材料答案、材料未覆盖、模型补充区分开。Digest Reading 已有 source_statement / inference / reusable_insight，Feedback 有支持状态与无依据提示；仍须人工检查反馈解释是否越过引文本身。本轮在报告逐例标记 Material-backed / Not covered by material / Model-added / Unclear，不扩展数据库。
- learning depth modes 将 quick 的有限范围显式展示；不能把有限阅读包装成全文覆盖。Digest 没有阅读深度档位，本轮也不增加。
- extraction integrity 的文件/文本摘要和缓存版本解决“旧提取结果被当作新材料”；PDF parser 保留分页并把 OCR 作为单独能力。Digest sourceRevision 可拒绝旧 Evidence，但现有 PDF 的图表、扫描内容和物理页码限制仍应明确；不为本轮新增 OCR 平台。

## kaogongzhentizhengliu

固定阅读版本：[84ab93d4](https://github.com/ERRRC/kaogongzhentizhengliu/tree/84ab93d4b64b61d897bece8a1c0a5bab06b4feb2)。阅读 README、00-使用说明，具体阅读削弱论证多项组合题、三段论补充前提考点及 2014 年公共图书馆材料条目。

真实题目、材料、考点之间的链接服务于解释错误：题干条件 → 为什么选错 → 推理结构 → 相似题。概念页将“断点搭桥”的方向写清，且保留对官方解析的质疑；材料页保留年份、单位、分母，避免数字脱离上下文。项目也明确自动注释可能有错，不能把链接数量当知识质量。

Digest 对应物是 Task、首次 Attempt、具体 Gap、Evidence 和 Revision。Pilot 先观察学生是否能指出原答案的错误并修正，而不是要求整理概念库。未来迁移题是否值得做，要看修订正确但换题仍失败的真实证据。此次不复制题库、解释文本或 Graph，不创建自动题目生成器。

## 本轮取舍

直接落实：预先制定材料清单；分开定位、语义、关键遗漏、材料边界验收；用一份真实长法条检查中段与末尾；检查反馈有没有误读学生原话。P0/P1 由实际失败决定，不能因参考架构更复杂就宣称现有产品有 blocker。

未来候选只记录于 [POST_PILOT_ARCHITECTURE_IDEAS.md](POST_PILOT_ARCHITECTURE_IDEAS.md)。本轮不建设 coverage ledger、知识图谱、向量检索、智能体或全自动课程。
