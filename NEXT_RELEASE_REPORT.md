# NEXT_RELEASE_REPORT

最新复验日期：2026-09-22。Digest 0.2.1 Preview Pilot 验收报告。第1–12节保留2026-09-19交付背景；本轮新证据与结论见末尾2026-09-22章节及[详细逐案例审阅](docs/PILOT_ACCEPTANCE_2026-09-22.md)。

本轮冻结产品能力，仅完成发布检查点、Preview 配置、真实模型与公网 QA。最终判定见第 10 节；不能把引用可定位等同于语义正确或学习效果。

## 1. What changed

Course → Task → 独立答案 → Attempt → Feedback → 原文 Evidence → Revision → 刷新继续学习的最小闭环已固化。首次答案先于 AI 保存，修订追加；失败、取消、旧请求和文档版本变化不会覆盖学习记录。旧 Reader / Review / KnowledgeUnit / confirmed Relation 保留。

本轮额外修改仅涉及交付：Playwright 改为 package-lock 锁定的本地依赖，消除个人机器路径；恢复标准 .gitignore；新增只读敏感信息审计和有界公网验收脚本。原先名为 .gitignore 的历史资料目录完整重命名为 .legacy-workspace，155 个 tracked 文件内容不变，没有删除历史。QA、env、凭据、build、部署缓存均忽略。

## 2. Product decisions

Digest 验证的是论述型、案例型、材料密集型课程中“自己的答案差在哪里”。学生先答，反馈再出现；不代替学生首次作答。不提供掌握率、自动分数或未经证实的学习提升。

Activation 是真实材料下作答并完成有效修正。事件仅表示流程候选，修正是否有效仍须人工判断。Graph 保留但不是主路径。

## 3. Architecture decisions

保留 Vanilla JS、ES Modules、History Router、IndexedDB 和 Vercel Functions。没有框架迁移、向量库或 Agent。

客户端 /src/workspace/main.js；入口 /app/index.html；Landing /index.html。构建仅复制前端运行文件到 dist。Serverless api 与 pilot 单独发布。使用 scripts/prepare-pilot.mjs 创建隔离上传目录，避免上传历史资料和 QA。

## 4. Data model

IndexedDB digest-v02，version 2，只增量增加 courses/tasks/attempts/feedback；保留全部旧 stores。

- Course：课程、关联资料及任务。
- Task：问题、rubric、材料范围。
- Attempt：不可覆盖的 userAnswer、taskSnapshot、反馈状态、追加 revisions。
- Feedback：overall、strengths、gaps、下一步、模型工作流版本、sourceRevisions、程序验证的 evidenceRefs。

备份 v2 支持旧 v1，空学习库原子恢复，拒绝覆盖/坏外键。未提交修订草稿在 settings，不进入备份。所有学习资料属于浏览器 origin；无云同步。

## 5. AI workflow / Production AI Path

Browser → 同源 /api/access → HttpOnly Secure 签名会话 → /api/digest → 服务端模型。普通学生不需要 API Key。研读与反馈共用固定代理；前端不能指定上游、Key 或模型。

Feedback：限定 Task 资料 → 按答案句子组织核查上下文 → 一次 JSON 生成 → 严格字段校验 → 答案引文校验 → 原文逐字/段落/offset/source version 验证 → 安全文本 UI。没有全文检索库。材料最多 60,000 字符，答案最多 16,000；超限拒绝，不静默截断。研读既有结构修复最多一次。

本次服务器模型：alibaba/deepseek-v4.1-flash。服务端 deadline 165 秒，客户端 175 秒，Function 180 秒，max_tokens=12000。MODEL_API_KEY、MODEL_API_BASE_URL、MODEL_NAME 的原值保留，仅增加 Preview target；Production 试用码原值保留，Preview 使用独立随机码。所有凭据留在平台/被忽略本地文件，未提交。

## 6. UX changes

Dashboard 优先继续任务，Course 显示材料/任务/近期作答。Reader 可从反馈定位原文并返回原 Attempt。反馈明确提示“引用存在不代表判断正确”；无有效依据不创建假链接。修订完成明确尚未用新问题检验。

保持暖白、墨色、蓝色导航和琥珀证据。没有视觉重做。本轮未新增产品功能。

## 7. Tests

- npm test：60 passed / 0 failed，保留原 40 项。
- npm run build：通过；Vercel 远端 build：通过。
- npm run qa:browser：16 checks passed，真实 Chrome、mock AI、0 pageerror。
- git diff --check 与 scripts/audit-pilot.mjs：通过，未发现所检查的密钥模式、凭据文件、本机路径或误提交产物。

覆盖 Course/Task CRUD、原答不可变、revision、AI failure、取消/旧请求、文档/任务变更、错误证据、增量 DB migration、旧/新备份、metadata 隐私和删除课程不删除 Document。敏感信息模式扫描不是对整个 Git 历史的安全认证。

## 8. Browser QA / Public Browser QA

本地真实 Chrome 检查 1440/1024/768/390：Landing、Dashboard、Library、Reader、Review、Graph、Course、Task；包含长文本、键盘、reduced motion、移动 Review。

真实文件恢复：UI 下载 JSON → 全新空 context → 文件上传恢复 → 再次下载逐 store 比对。覆盖 Document、ReadingResult、Evidence、Review、KnowledgeUnit、Relation、Course、Task、Attempt、Feedback；activities 因操作增加单独处理。

公网 Preview（已部署源码，不是 localhost mock）：

- 1440 和 390：创建课程 → 导入真实政策节选 → 创建任务 → 自己回答 → 试用码 → 真实模型反馈 → 原文高亮 → 返回 → 修订 → 刷新；首次答案保留。
- 新开页面后已完成 Attempt 仍存在；零 pageerror、零资源 404，PDF.js 模块正常加载。
- 公网页面 route interception 模拟 400/429/500/503/504、network、empty、malformed、missing fields，答案保留、可重试、无假完成；后续失败未破坏旧成功反馈。
- 慢请求取消通过。已部署 ProxyTransport 使用注入 50ms deadline 验证 timeout 提示；这是加速客户端故障测试，不冒称实际等待 175 秒或上游真实超时。
- 实际服务器：未登录 401、正确试用码 200、无效 messages 400、GET API 405。

公网脚本共 17 项检查通过，另有 API/deadline 检查。故障模拟与真实模型验收分开记录。未把 Chrome viewport 当成物理手机或跨浏览器认证；本轮 PDF 检查是模块加载，未重新执行完整 PDF 上传矩阵。

本地证据目录：qa-artifacts/next-release、qa-artifacts/preview、qa-artifacts/real-model。包含截图、机器结果和备份；不提交、不部署。真实模型逐案例语义审阅见 docs/V0.2.1_REAL_MODEL_ACCEPTANCE.md。

## 9. Known limitations

本地数据没有账户同步，需导出备份；同一 Preview origin 才能继续原数据。分享访问入口 7 天有效，过期须续发入口，不能让学生改用新部署域名后误以为资料丢失。

验收样本小：英文论文只有一段短原句，法律案例和长文边界为明确标注的教学构造；不是各学科或长论文 benchmark，不代表五名学生已实测。部分反馈较啰嗦、重复指出同一错误，偶尔要求已有限定的观点进一步限定。准确性不以比例承诺。

服务使用实例内频控，不是跨实例硬预算；未新增支付或预算平台。供应商费用硬上限未核实，应保持五人邀请范围，不能据本报告公开开放。

## 10. Pilot readiness / Pilot Decision

**READY WITH KNOWN NON-BLOCKING LIMITATIONS**。可以交给 5 名受邀学生进行精选短材料的探索性 Pilot。10 个真实模型案例结构通过，人工语义审阅 6 PASS / 4 PARTIAL / 0 FAIL；另外 2 次真实 UI 调用完成双端闭环。剩余 Pilot blocker：本轮未发现。已知限制见第 9 节及逐案例报告：小样本不代表广泛准确性，部分反馈重复、过细或含内部字段名。停止扩功能，进入用户试验；不公开开放、不当成自动评分服务。

## 11. What was intentionally NOT built

没有新 Dashboard/Graph/Course 能力、自动题库、Agent、Vector DB、RAG 改造、Review 算法、教师端、社交、增长、支付、账号系统或全站 redesign。没有 merge main、force push、改写历史或发布 Production。

## 12. Recommended next experiment

五名学生使用同一类论述课程，带自己的短材料、真实问题和可选 rubric。观察能否独立回答、理解具体缺口、回原文核查并修正。记录误导性反馈与卡住步骤；数日后使用不同案例再答，由教师/研究者对比解释质量和条件迁移。将流程完成与实际学习改进分开。

## Git checkpoint / Remote branch

- 基线：1a620eb57bd4a0c387a7d56c9f5001e6b3cbc7f4。
- 产品检查点、已验收部署源码：0708820ff0006c467b38c3a7c6b847fd71fbab6b。
- Commit：feat: prepare Digest 0.2.1 pilot candidate。
- origin/codex/digest-v02 已建立并确认；main 未改变。后续提交只收纳验收脚本和报告，不改变该已部署产品代码。
- 初次 push 的 schannel 传输报错后核查远端，再以单次 http.postBuffer 设置重试；远端 SHA 与本地一致，没有 force。
- 修改清单：git diff --name-status 1a620eb..HEAD。除 155 个内容不变的历史重命名外，集中在 src/data、domain/training、workspace、reader、proxy transport、tests、README/product/architecture/report、package manifests 与 .gitignore。

## Preview Deployment / Production audit

Preview: https://digest-rfu0e349k-fuoguzs-projects.vercel.app

Deployment: dpl_4JMA65M3afa1zk3qBUG6cXAmCA9Q；2026-09-19 11:20:33 +08:00；target=Preview（API target=null），READY，远端构建成功，meta githubCommitSha=0708820ff0006c467b38c3a7c6b847fd71fbab6b，无 gitDirty 标记。

项目 Git link 为空，未连接 GitHub 自动部署，因此 push 不会自动 Preview，也没有当前跟踪的 Production branch。通过授权 CLI 从隔离目录手动部署 Preview。

Production 域名 digest-sigma.vercel.app 未修改。当前 production deployment 仍为 dpl_AG9s5qh2krmdQDD21zVgkUxTb7i8；其历史元信息 SHA=36ca5c2c14fe64d92ad15d9ad9f272e8e56272b9 且 gitDirty=1，因此不能断言生产内容逐字等于该 commit。

Vercel 登录问题已解决。项目仍启用部署保护，仅为 Preview 创建七天分享入口，没有关闭项目保护。私人邀请文件在被忽略的 .vercel/PILOT_INVITATION.txt；不要提交或公开发布它。

## Commands actually run — 2026-09-19 historical

Git status/diff/stat/check/branch/log/remote/worktree/reflog/ls-remote；npm install --save-dev --save-exact playwright@1.62.1 --ignore-scripts；npm test；npm run build；npm run qa:browser；node scripts/audit-pilot.mjs；git commit；git push -u origin codex/digest-v02；vercel whoami/project inspect/env ls/api；node scripts/prepare-pilot.mjs；vercel deploy --cwd .pilot-deploy（无 --prod）；node tests/browser/real-model.mjs；DIGEST_REAL_UI=1 node tests/browser/preview-pilot.mjs；node tests/browser/preview-api.mjs。

# 2026-09-22 Independent Pilot Revalidation

## Real Model Acceptance

13个新案例，14次模型请求（政策研读一次自动结构修复），另4次真实双端UI反馈调用。逐条审阅 **7 PASS / 6 PARTIAL / 0 FAIL**；这是有限样本，不是准确率。检查清单在模型调用前制定，覆盖完整正确、部分正确、条件遗漏、概念混淆、无依据推论、不同合理观点与材料不足。详细A–H矩阵见 [本轮验收](docs/PILOT_ACCEPTANCE_2026-09-22.md)。

## Evidence Support Quality

139候选引文，138可定位，1因模型将分号改成句号被判invalid。匹配引用的段落、UTF-16 offsets、sourceRevision均一致；语义支持另行逐条审阅。错误候选未变成有效链接。没有把这些数量当成判断准确性。

## Critical Omission Findings

预写清单中的关键条件均被覆盖，包括非随机/无对照、适用范围、及时认可例外与长文末尾家庭事务例外。未发现本轮选定任务的阻塞性关键遗漏。这不等于完整材料所有命题都被覆盖。

## Material / Model Boundary

无金额/效果数据时能诚实说明，正确答案可得到空gaps。仍有非阻塞问题：泛化研究证据门槛、对已合理限定观点继续挑剔、附加缺口轻微误读；长文建议把某日期称为“公布日期”但输入未提供该背景。公网UI偶有answerChecks内部词。均已记录，未用新增功能掩盖。

## Long-document Behavior

官方2021年个人信息保护法第1–74条，9,341字符、181段；全部正文进入消息，无检索截断。一次反馈约45.4秒，找到第4、13、28、54、72、74条相关检查点，最后证据结束offset=9341。六项关键判断都有反馈；不是74条全覆盖认证，也不是完整英文论文或PDF图表能力证明。

## Preview Deployment

本轮未重新部署：产品源码与现有Preview一致，仅新增验收工具和报告。部署 `dpl_4JMA65M3afa1zk3qBUG6cXAmCA9Q`、源码 `0708820ff0006c467b38c3a7c6b847fd71fbab6b`，READY；[Preview地址](https://digest-rfu0e349k-fuoguzs-projects.vercel.app)。私密分享入口仍需单独使用，不能把裸URL当公共无保护入口。

重新确认登录与环境变量target。Production仍为 `dpl_AG9s5qh2krmdQDD21zVgkUxTb7i8`；main未变，未改Production配置、域名或项目保护。模型Key仅服务端Pilot路径使用，未写入测试fixtures或报告。

## Public E2E

1440、390各两轮真实模型完成课程→文本材料→任务→原答→反馈→原文→返回→修订→完成→刷新，新页/课程继续可用。已查看截图；反馈偏长但学习路径可操作。

公网故障最终独立回归15项通过：400/429/500/503/504、network、invalid/truncated JSON、缺字段、空回复、取消、连续点击与响应式。已部署仓储拒绝旧/取消请求，保留同一Attempt原答、Revision与Feedback。超时用已部署客户端注入50ms测试，服务器实际401/200/400/405已验证；不声称向供应商制造了真实限流故障。

真实浏览器备份下载→新空context→上传→Evidence/Revision→再次下载比对通过；只按合同清理临时请求ID，学习字段完全一致。公网此样本含空的旧Reading/Graph stores；非空旧数据的十种store恢复在本轮本地16项浏览器QA中验证。

两次集成QA的测试工具断言曾失败（人工dispatch绕过disabled；恢复补null字段），已修正测试并用无收费调用的故障/恢复脚本补验，不声称集成脚本原始退出码全绿。完整说明及证据路径见详细验收。

## Remaining P0/P1 Issues

在上述范围内未发现剩余P0/P1。非阻塞限制：样本小、无教师盲审和真实学生结果、英文短摘录、PDF不含OCR/图表完整性保证、AI偶有冗余/越界表达、无跨设备同步、同一origin与定期备份要求、分享入口需到期续发、未核实上游费用硬上限。没有将P2变成本轮开发任务。

## Pilot Decision

**READY FOR 5-USER PILOT WITH KNOWN NON-BLOCKING LIMITATIONS**

可以邀请5名学生用精选材料进行探索性Pilot；停止功能开发。准备真实问题和可选rubric，告知AI传输及备份，记录反馈接受/拒绝与实际修正，由教师/研究者复核关键反馈；数日后用人工选择的新案例再测。不能将“完成修订”自动认定为学习效果。

## Current changes and commands

开始HEAD `ece4b735f7c743bb2c8aaa492da7a0106930faa5`，origin分支一致，开始工作树clean。仅修改README、NEXT_RELEASE_REPORT、历史验收入口、测试runner，新增本轮验收/参考/未来研究笔记、13案例fixture及公开法条fixture、恢复QA脚本；产品源码、数据库与配置无修改。交付commit以 `git log -1` 为准，产品部署SHA如上。

本轮实际运行：git status/branch -vv/log -15/diff/remote/ls-remote；npm test（60/60）；npm run build（通过）；npm run qa:browser（16/16）；Vercel whoami与只读api配置/部署检查；两参考库只读sparse clone/git show；DIGEST_ACCEPTANCE=20260922 node tests/browser/real-model.mjs；DIGEST_REAL_UI=1 node tests/browser/preview-pilot.mjs（两轮真实双端UI）；DIGEST_REAL_UI=0 node tests/browser/preview-pilot.mjs（最终15项故障回归）；node tests/browser/preview-restore.mjs（退出0）；node tests/browser/preview-api.mjs；恢复比对器篡改负测；git diff --check；node scripts/audit-pilot.mjs。

参考笔记：[PILOT_REFERENCE_NOTES](docs/PILOT_REFERENCE_NOTES.md)；未来候选仅记录于 [POST_PILOT_ARCHITECTURE_IDEAS](docs/POST_PILOT_ARCHITECTURE_IDEAS.md)，没有实现SourceBlock、SourceClaim、Coverage ledger、Graph或迁移题系统。
