# NEXT_RELEASE_REPORT

日期：2026-09-18。交付：**Digest 0.2.1 Trusted Pilot Foundation + Course / Attempt 最小闭环，Pilot candidate**。

**结论：本地代码与 Chrome mock 闭环已完成；尚不能放行给 5 名真实学生无人陪同使用。** 生产模型访问受外部权限阻塞，本轮未部署，真实模型语义质量与公网整链路没有验收。不能把自动测试或可定位引文等价为真实学习效果。

## 1. What changed

实现 Course → Task → 独立作答 → 持久化 Attempt → Feedback → 原文 Evidence → Revision → 刷新继续学习。

首次答案先于 AI 保存；取消、网络失败、空响应、结构错误不会抹掉答案或覆盖旧反馈。修订追加保存并保留修改说明，不覆盖第一次回答。草稿自动本地保存，未完成反馈刷新后可以重试。

基础修复包含 Proxy 客户端 deadline、空/非 JSON 响应提示、增量 IndexedDB 升级保护、包含新旧数据的原子备份恢复，以及真实 QA 发现的键盘 skip-link 焦点问题。

工作树基线原本干净。没有清理原用户数据，没有修改 main，没有 reset/clean/stash，也没有发布或创建 Git commit。

## 2. Product decisions

定位为论述型、案例型、材料密集型课程训练。最小课程只组织材料、问题与作答记录，不引入 LMS。

AI 反馈先指出具体答案片段、解释、依据和修改动作，避免代写标准答案。无 rubric 时明确不代表教师评分。未核实依据不提供假链接；模型对语义支持的判断与程序对逐字引用的验证分开显示。

完成修订不代表掌握。界面说明仍未被新问题验证。Activation 定义保持“用自己的真实材料作答，并据反馈完成有效修正”；本地事件只标记 activation candidate，实际改进由 Pilot 人工判断。

自动 follow-up 出题没有做：无法在真实模型上验证质量。保留同题独立重答（不展示旧答案）与回课程手动创建不同案例问题的入口。

## 3. Architecture decisions

保留 Vanilla JS / ES Modules / History Router / IndexedDB / Vercel Functions。没有 React、Next.js、Vector DB、Graph DB 或 Agent 编排。

实际入口是 `index.html → src/landing.js` 与 `app/index.html → src/workspace/main.js`，不是旧 src/main.js 或 app.js。

`/api/digest` 复用既有受试用码保护的同源服务器链路，承载研读及新反馈，无新增生产 secret。普通学生不需 API Key。Developer 自带 Key 模式保留并明确限定为开发用途。

数据库物理版本从 1 增到 2，仅补建四表。备份仍为 digest-v02 格式，version=2，兼容 version=1 导入。**回滚客户端必须保持 DB v2 兼容，不能把清库作为回滚方法。**

## 4. Data model

| 对象 | 新增或保留的关键数据 |
| --- | --- |
| Course | id/title/description/createdAt/updatedAt/documentIds/taskIds |
| Task | id/courseId/title/prompt/rubric/description/documentIds/timestamps/version/draftAnswer |
| Attempt | id/taskId/courseId/userAnswer/submittedAt/taskSnapshot/status/feedbackId/activeRequestId/revision[] |
| Revision | id/userAnswer/reflection/createdAt/feedbackId/verification=unverified |
| Feedback | id/attemptId/overall/summary/strengths/gaps/evidenceRefs/suggestedNextStep/sourceRevisions/modelInfo/createdAt |

Document、ReadingResult、EvidenceAnchor、ReviewCard、KnowledgeUnit、Relation、Activity 全部兼容保留。课程删除级联自己的任务/作答/反馈，不删除 Library 文档及旧学习资产；anchors 保留以避免历史引用被误删。正在被任务引用的资料不能直接移出课程。

备份包含新旧 11 个学习 stores（含 activities），不含 settings/API Key。首次答案和已保存修订包含在备份中；未提交修订草稿属于本地 settings，不包含。恢复只在空库完整校验后原子提交，不合并覆盖；重新校验引文、source version 和答案引用。

## 5. AI workflow

固定 Task snapshot / rubric / answer → 确定性答案分句 → 限定所选课程文档 → 生成段落与来源快照 → 一次 JSON feedback 请求 → 严格运行时 schema → 答案原句与材料引文验证 → 原子提交 → 安全文本 UI。

分句是可检查的候选核查句，不冒称语义 Claim 提取。小规模全文上下文，材料总量 60,000 字符、答案 16,000、序列化消息 95,000 上限；超限明确拒绝，不静默截断。没有 embeddings。

反馈要求 overall、strengths[]、gaps[]、suggestedNextStep；每项包含 type、userAnswerQuote|null、explanation、support、evidenceCandidates、suggestedAction。support 为 supported/partially_supported/uncertain/no_evidence，不使用百分比。没有 valid anchor 时降为 no_evidence。Provider json_object 配合本地严格验证，不宣称供应商支持 constrained JSON Schema。

Evidence 沿用 exact match、唯一段落定位、UTF-16 offsets、SHA-256 sourceRevision。错误 quote、重复 quote、不存在文档、版本变化都不能生成可靠链接。引用存在不验证解释是否成立，真实模型语义核查仍是必要放行条件。

当前 server deadline 165 秒、客户端 175 秒、Vercel 180 秒；服务器输出 12,000 tokens/100,000 字符。浏览器取消不能保证供应商立即停止计费，但本地迟到响应不得保存。Feedback 无自动 repair；失败手动重试，原 Reader 的一次受控 repair 保留。

生产 modelInfo 记录流程版本和 transport，具体服务器模型 ID 尚未随结果返回；不会伪造已确认的供应商/模型名。

## 6. UX changes

- Dashboard 优先未完成任务、课程、最近作答和材料；最新未完成 Attempt 不会被旧完成记录掩盖。
- 主导航加入课程；Graph 移至工具区域，手机仍可访问。
- 首次作答区没有标准答案。反馈按优点/缺口组织，引用 amber，修订有单独说明与历史。
- Feedback Evidence 可在尚无 ReadingResult 时打开原文。手机返回反馈按钮、反馈条目定位和修订草稿恢复已验证。
- 现有 Review 保留，增加课程再检验入口。没有新的强制知识点整理步骤。
- Landing 与产品说明改为新核心任务，不贬低通用 AI 工具。
- 保持暖白、墨色、cobalt、amber。没有视觉重做、新动画或图谱投资。
- 修复 skip-link 真正移动焦点；保留 reduced-motion。

## 7. Tests

**`npm test`：60 passed，0 failed，保留全部原有 40 项，新增 20 项。**

新增覆盖：Course/Task CRUD；答案先保存与数据库重开；首次答案不可被 revision 覆盖；无改动不能完成；Feedback 缺字段/空/结构错误；AI 失败保留；伪造答案片段与错误材料引文；文档版本变化；旧请求、取消、忽略 abort 的 transport；Task 编辑竞争；新备份往返与坏外键零写入；旧备份导入；物理 DB v1 升级；超长材料拒绝；metadata 隐私；课程删除保留材料；导入伪造 matched 标记重新核验。

Proxy 新测试包含同源 cookie、无前端 Key、429/5xx/空/非法 JSON/网络错误、deadline 与取消。既有测试继续覆盖四种 reading modes、重复引文、UTF-16、Review、Relation 确认、存储失败回滚。

**`npm run build`：通过，输出 dist。`git diff --check`：通过，仅有 Windows LF/CRLF 提示。**

## 8. Browser QA

**`npm run qa:browser`：通过。** 使用真实安装的 Chrome，headless、独立 localhost:5193、全新 browser context，reduced-motion，明确标记的 mock AI，无真实密钥、无用户浏览器资料库清除。

| 实际操作 | 结果 |
| --- | --- |
| 创建课程 → 导入传播学课程笔记 → 关联 → 创建问题/rubric | 通过 |
| 独立答案 → 刷新恢复草稿 → 提交 → Feedback | 通过 |
| Evidence → Reader 精确高亮 → 返回反馈 | 通过 |
| 修订与说明 → 完成 → 刷新，首次答案保留 | 1440、390 均通过 |
| Reader 研读 → Review → 2 个 KnowledgeUnit → 建议并确认 Relation | 通过 |
| 手机 Review 回忆 → 揭示 → 评级 → 刷新 | 通过 |
| 实际导出下载 JSON → 关闭旧 context → 空 context 上传恢复 | 通过 |
| 恢复后再次下载，与原备份全部业务 stores 逐项比较 | 相同；activities 因新操作增加，单独排除比对 |
| 503、429、空、非法 JSON、缺字段 | 答案保留、可重试、无假完成 |
| 网络失败 → 同一 Attempt 重试成功 | 通过 |
| 慢请求取消 → 刷新 | 答案保留、无假反馈 |
| 错误 quote | 诚实提示，无 gap 的假定位链接 |
| 长答案、8 条长反馈、末条依据跳转 | 手机通过 |
| 长标题、长段落 | 四种宽度无页面水平溢出 |
| 键盘 skip-link | 修复后焦点进入 main |
| 未捕获 pageerror | 0 |

1440 / 1024 / 768 / 390 全部检查 Landing、Dashboard、Library、Reader、Review、Graph、Course、Task 的实际 DOM 布局与截图。人工查看了桌面反馈、手机反馈、手机原文高亮及 Dashboard 截图。不是物理移动设备、全屏幕阅读器或跨浏览器认证。

备份验收内容：1 Document、1 ReadingResult、7 EvidenceAnchor、1 ReviewCard（含评级历史）、2 KnowledgeUnit、1 confirmed Relation、1 Course、1 Task、2 Attempt、2 Feedback；含修订。课程文本为验收用自写教学笔记，不冒称学生实测或正式课程研究。未重新执行真实 PDF 导入的本轮浏览器矩阵，原 PDF 自动测试保留。

产物：`qa-artifacts/next-release/results.json`、`browser-backup.json`、`restored-backup.json` 与各宽度截图。均不进入产品构建；`failure.png` 若存在属于中间失败排查，不是最终结果。

## 9. Known limitations

1. **真实模型未验收**：General、Academic Paper、Legal Case、Policy Document，以及中文、英文论文、长材料、语义支持、可答性、关系质量和新 Feedback 具体性都不能用 mock 结果替代。
2. 本地优先，浏览器清理会丢数据；无账号、云同步、跨设备继续。需定期保存备份。
3. 选择材料仍需学生判断；没有整课程检索或自动出题。超过上下文上限需缩小任务材料范围。
4. 修订保存不自动验证改得是否正确；有效 Activation 需人工核查。不得宣称掌握率或学习提升。
5. 本地 events 没有外部汇总仪表盘；review_started 是进入旧 Review 页面，review_completed 为单卡完成评级，原 review_rated 保留兼容统计。
6. Developer Mode 的 Key 仍在本地 localStorage，这是显式开发选项；普通生产用户使用 Proxy。
7. Provider 硬预算未核实；内存频控不是跨实例硬配额。模型名仅服务器配置，客户端 provenance 当前以 workflow version 为主。
8. 未执行生产部署；本地 HTTP 连接失败不意味着已确认线上服务宕机。

## 10. Pilot readiness

**现在是否可给 5 名真实学生使用：不放行无人陪同真实 Pilot。** 本地 mock 可用于内部流程演示，但不能充当真实学习反馈服务。

已尝试的外部检查：

- `npx vercel env ls production --cwd .pilot-deploy`：CLI 无有效凭据，进入登录等待后已停止；未读取 secret。
- Vercel connector `list_teams` 返回空列表；用仓库已有 projectId/orgId 请求 `get_project` 返回 **403 Forbidden**。有明确项目访问权限障碍，未绕过。
- Node fetch 对历史稳定域名的 `/`、`/app/library`、`GET /api/digest`、无认证同源 `POST /api/digest` 均发生连接错误，未取得可用 HTTP 状态。本轮没有成功生产模型请求。

放行剩余 blocker：恢复该 Vercel 项目合法访问并确认环境/额度；完成四模式与新 Task Feedback 的有限真实模型人工核查；发布当前构建后在稳定 origin 验证真实邀请码 → 模型 → Evidence → Revision → 刷新/备份全链路。

## 11. What was intentionally NOT built

没有 React/Next.js 重构、Vector DB、Graph RAG、3D 图谱、复杂 Agent、自动全课程生成、AI Tutor、教师后台、社交、积分、排名、签到、FSRS 大改、支付或云同步。

没有自动生成低质量 follow-up 问题，没有伪造 mastery/understanding 百分比，没有删旧图谱数据，没有用新的非核心功能替代学习链路验收。

## 12. Recommended next experiment

权限与真实模型验收完成后，选择一门材料密集型论述课程，邀请 5 名学生各带自己的短材料与真实问题。先收集其独立答案和 rubric；观察是否能读懂具体 gap、核对 Evidence 并自主修订。

人工对照原答/修订，记录具体概念或推理改进、误导性反馈、定位成本及卡住的位置。数日后换一个真实案例再作答，用解释质量与条件迁移判断是否真的理解。将流程完成率与学习效果分开，分析“有效修正”而不是摘要生成次数。

## Repository audit / HEAD / commands

- 当前分支：`codex/digest-v02`。
- 当前 HEAD：`1a620eb57bd4a0c387a7d56c9f5001e6b3cbc7f4`（本轮未 commit，改动留在工作树）。
- Local branches：`codex/digest-v02`、`main`。
- 当前 worktree：仓库根目录，检出 v0.2 分支。
- `git ls-remote --heads origin`：仅 `main`，远端 SHA `7f0bf19053346d70979d3918779a6e8788f937ab`；不据此否定本地 v0.2。
- reflog 与 commit history 明确包含 v0.2：`9cd331f` Core、`927eaae` Pilot、`38d5ea3` deadline、`916a7f9/53876ca/36ca5c2/aef611b` Proxy 修复及当前 HEAD。
- 初始工作树干净；既有 `.gitignore/` 资料目录已完整迁移为 `.legacy-workspace/`，恢复标准 `.gitignore` 文件，保留历史内容。

主要实际运行命令：

```text
git status --short
git branch -a
git rev-parse HEAD
git log -8 --oneline
git worktree list
git reflog --all -12
git ls-remote --heads origin
npm test
npm run build
node --check src/workspace/training.js
node tests/browser/next-release.mjs
npm run qa:browser
git diff --check
npx vercel env ls production --cwd .pilot-deploy
npm exec --yes --package=prettier -- prettier --ignore-path .git/info/exclude --write <本轮修改的 JS/CSS/测试文件>
```

使用 rg/Get-Content 审计源码、scripts、API、environment 使用方式及所有相关文档；用隔离 Chrome 运行 UI QA、检查截图和备份文件。最初默认 prettier 因既有 `.gitignore/` 目录失败，指定 `.git/info/exclude` 后格式化成功，没有修改该目录。系统 `python` 入口不可用的一次文本编辑尝试未写文件，改用 PowerShell 完成；Python 不是项目运行依赖。

完整修改文件清单见下方（生成时工作树状态）。

```text
 M PRODUCT_EXPLANATION.md
 M README.md
 M app/index.html
 M docs/V0.2_ARCHITECTURE.md
 M docs/V0.2_IMPLEMENTATION_PLAN.md
 M docs/V0.2_M3_M4_QA.md
 M docs/V0.2_PILOT_DEPLOYMENT.md
 M docs/V0.2_PRODUCT_SPEC.md
 M docs/V0.2_REAL_MODEL_ACCEPTANCE.md
 M docs/V0.2_RELEASE_REPORT.md
 M index.html
 M package-lock.json
 M package.json
 M src/ai/proxy-transport.js
 M src/data/backup.js
 M src/data/db.js
 M src/data/learning-repository.js
 M src/reader/reader.js
 M src/workspace/main.js
 M src/workspace/review.js
 M src/workspace/tools.js
 M src/workspace/views.js
 M tests/fixtures/mock-ai-server.mjs
?? NEXT_RELEASE_REPORT.md
?? src/data/training-backup.js
?? src/data/training-repository.js
?? src/domain/training.js
?? src/styles/training.css
?? src/workspace/training.js
?? tests/browser/next-release.mjs
?? tests/fixtures/feedback-output.mjs
?? tests/unit/proxy-transport.test.mjs
?? tests/unit/training.test.mjs
```
