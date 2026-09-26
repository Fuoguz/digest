# NEXT_RELEASE_REPORT — 2026-09-24

Digest 0.2.1 UI & Long-reading Pilot Update。以下第1–12节为本轮交付事实；文末历史报告仅作历史记录，旧上限、部署地址和测试结论不代表当前版本。

- Branch: codex/digest-v02
- HEAD: ced3a6664eafcbbd0c5968dd416761e5d2b78a2f
- 本轮修改在工作树，未创建 commit、未 push / merge。Production 来自本轮隔离上传源码，不是声称上述 HEAD 已包含改动。
- Production: https://digest-sigma.vercel.app
- READY deployment: dpl_7Egiaj3nUNqcz2rgXESkpsrGyn5a
- Preview: dpl_DPVsQG8P5WCdGuJyM4rtCfCTjfLW（先构建验收，保护保留）
- 可回滚的前 Production: dpl_217zmjLSWkqthbq2cZZ78BWHh2AU。保持稳定域名及 IndexedDB v2 兼容，不清库。

## 1. What changed

完成全站暖白编辑式 UI、任务优先的导航和工作台、课程直接导入材料、重点概览与按需展开、移动阅读/修订布局、中英文界面和独立 AI 输出语言。Reader 新增原文分段、范围选择、进度持久化和断点续跑；反馈改为有范围说明的词语检索。保留旧课程、答案、修订、Review、Graph 和备份数据。

用户提供的 Guardian PDF 实际提取为14页、32,285字符、54段，并非超过代理100k字符上限。原截图的“模型没有返回可用内容”本轮未稳定复现，不能断言唯一根因。已针对单次输出压力、PDF引用抄录错误及失败后从头重来实施改进。代理区分 output_limit 与 empty_response，不把推理字段当最终答案。

## 2. Product decisions

优先回答“下一步做什么”和“主要缺口在哪里”。新用户有三步引导；反馈先缺口后优点，保留首次答案但默认折叠，修订有独立写作区。重点概览链接到具体判断，再核查原文。课程、任务、原答和用户材料始终优先。

使用可访问的 HTML/CSS 学习流程示例作为首页视觉素材；本轮没有调用 image 模型，也没有加入装饰性背景图。语言切换不重写用户文本或历史AI内容。反馈评价仅记录是否有帮助、不准确、依据不相关。

## 3. Architecture decisions

继续 Vanilla JS / ES Modules、IndexedDB v2、同源 Serverless Proxy。新增 context.js 和轻量字符串目录，无框架/数据库迁移。生产 endpoint/model/key/试用码值不变；普通学生无需 API Key，生产界面不突出开发配置。构建和上传仅包含运行文件，用户 PDF、QA产物、凭据不上传。

## 4. Data model

ReadingResult 增加 scope / outputLanguage / overview；Feedback 增加 retrievalScope / outputLanguage，工作流版本 course-feedback-v2；旧记录兼容。settings 新增 reading-progress:documentId checkpoint，含版本/范围/语言 key 和分段结果。checkpoint 写入与 requestId/source signature 检查在同一事务；正式结果提交时原子清除进度。

首次 Attempt 不可覆盖，Revision 追加。备份 schema 不变，已提交全部资产正常导出；settings 内未提交草稿和未完成研读不包含在备份中。feedback_rated 活动不存答案/正文。

## 5. AI workflow

Reader：选定范围 → <=10k字符分段（最多12段）→ 每段结构校验（最多一次修复）→ 引用核对 → 保存进度 → 多段整体概览 → 校验引用已有claim IDs → 原子提交。单段省去概览调用。失败/刷新可复用已成功分段，旧正式结果保留。

Feedback：限定任务资料 → 词语检索最多24k字符 → 任务/rubric/原答核查句/片段 → JSON反馈 → 严格结构和答案引文验证 → 原文Evidence验证。UI明确部分材料范围，不把未检索到等同于材料不存在。

引用优先选择程序从原文切出的 quoteId；程序取回原始子串，再执行原有 exact match、唯一性、段落、offset、source version 检查。错误编号/错段落/重复引用不会伪造链接。matched 只代表可定位，不证明语义。

本轮有界真实模型验收共8次调用，经既有已配置 Preview Proxy 发送本轮消息：全文基线1次、4个分段、末段改用片段编号复测1次、综合1次、英文Feedback1次。全部HTTP200，但不据此宣称稳定性。基线8条引用中6条匹配；旧直接quote分段分别8/8、8/8、8/8、2/8。末段 quoteId 复测8/8；英文反馈14/14可定位，4个缺口（其中1个明确无证据、不生成链接），用户答案引用正确。人工检查发现过度概括、混淆赞助与欺骗和缺少机制解释均被具体指出；不是盲评或学习效果实验。

分段调用约45–88秒，末段复测约50秒，综合25秒、英文反馈64秒。完整长文仍可能数分钟。最终综合提示增加了自然学生文案要求；该措辞微调通过mock流程，未额外付费重跑。最终部署的Production本轮只验证公网/资源/认证门控，没有声称重新以Production试用码完成付费全流程。

## 6. UX changes

覆盖 Landing、Dashboard、Course、Task、Library、Reader、Review、Search、Settings，Graph保留兼容。中文采用阅读舒适的系统字体，英文阅读/标题使用衬线层级；钴蓝行动、琥珀依据、柔和状态色。桌面左右阅读，手机标签切换；标题和长段落换行，键盘跳转、reduced motion保留。Reader范围和段落导航、反馈返回滚动上下文、草稿保存提示、空态/失败/取消状态均明确。

界面语言记住选择，切换前等待草稿写入，并恢复当前表单与展开状态。AI输出语言独立设置；原文和历史结果保持其原有语言。

## 7. Tests

- npm test：73 passed，0 failed；保留现有测试，新增长文、断点续跑、取消、旧请求、quoteId伪造/错段、跨窗口ID、备份恢复、输出语言和empty/output-limit区分测试。
- npm run qa:browser：16 checks passed；覆盖原学习闭环、移动Review、故障/取消、旧资产、真实备份文件下载并上传恢复，十类核心资产一致。
- DIGEST_TEST_PDF=<用户PDF路径> node tests/browser/upgrade.mjs：10 checks passed；实际PDF导入、第二段失败后刷新续跑、全文综合、Evidence、双语草稿、作答修订、双语9页×4宽度、无pageerror。AI为明确mock。
- npm run build：通过；Preview/Production远端build通过。
- git diff --check：通过（仅平台行尾提示）；node scripts/audit-pilot.mjs：无规则命中。该扫描不是完整安全认证。

旧测试为适配首次答案折叠新增展开动作，实际断言仍验证完整原答不可变；不是删掉失败断言。原60k材料拒绝用例改为验证检索范围明确与完整源保留，符合本轮需求。

## 8. Browser QA

真实Chrome测试1440/1024/768/390，中文/英文，包含本地完整链路与实际文件上传下载。截图位于qa-artifacts/upgrade/browser和qa-artifacts/next-release。fixture反馈不作为真实模型语义证据。

Production在全新未登录Chrome context验证首页、English切换、工作台和390布局，无JS错误/横向溢出。匿名HTTP检查 /、/app/、/app/library、样式、翻译目录、PDF.js均200，无Vercel登录页。同源 /api/digest 无试用会话返回应用401（预期门控），不是CORS或平台认证错误。Preview部署CSS的SHA256与本地相同。生产URL保持原origin。

Computer Use 已用于本地界面检查；最终再次打开公网标签时连接超时，未冒称该工具完成最终公网验证。上述公网交互由独立Chrome自动测试完成。Chrome视口不等于物理手机或Safari认证。

## 9. Known limitations

原偶发空输出未稳定复现，不能承诺上游永不失败。长文多次模型调用增加总等待与费用，后台关闭会中止当前调用；已完成段仍在本地。每次最多12段，过大材料需要选范围。没有OCR，PDF文本层/断行质量仍影响阅读。

词语检索不等于跨语言语义检索，可能遗漏不同语言或隐含相关材料；模型也可能给出语义不充分的证据。引用可定位不是正确率。答案16k限制保留，极大rubric/答案组合仍可能触发95k序列化上下文限制。供应商费用硬上限未在本轮核实。

单浏览器本地数据，无云同步。语言切换只翻译界面，新AI输出遵循单独选择，历史结果保持原语言。扫描式PDF、复杂数学论文、多学科长材料质量和真实学生学习提升尚未得到本轮验证。

## 10. Pilot readiness

可以开始5名受邀学生的有观察记录的小规模Pilot，保留现有试用码门控。当前自动化与本轮材料未发现数据完整性或UI闭环阻塞，但不宣称已达到无人值守的稳定服务水平。下一步应重点记录长文等待、模型空输出复发、检索漏证据和跨语言体验；若频繁发生，暂停扩大邀请。

## 11. What was intentionally NOT built

没有React/Next迁移、账号云同步、教师后台、OCR、Graph RAG、向量库、自动题库、复杂Agent、积分支付、假掌握率；没有删除Graph或旧数据。没有改变生产密钥、试用码或模型配置，没有使用临时分享URL作为学生入口。

## 12. Recommended next experiment

先让用户用同一Guardian PDF完整研读一次：观察每段进度、整体重点、引用跳转，再用一个真实课程问题作答并修订。五位学生记录首次完成时间、哪条反馈实际促成修改、依据是否支持判断、失败后能否继续。几天后用不同案例再答，由人比较论证质量，不用完成按钮或引用匹配比例冒充学习效果。

## Commands and changed files

实际运行：npm test；npm run qa:browser；DIGEST_TEST_PDF配置后node tests/browser/upgrade.mjs；npm run build；git diff --check；node scripts/audit-pilot.mjs；node scripts/prepare-pilot.mjs；Vercel CLI deploy --yes --cwd .pilot-deploy --scope fuoguzs-projects；vercel curl检查Preview资源；deploy --prod --yes --cwd .pilot-deploy --scope fuoguzs-projects；匿名HTTP/独立Chrome公网检查。CLI缓存59.12.0用于发布，避免npx启动等待。真实模型请求与回放校验脚本/响应在被忽略qa-artifacts，包含用户原文，不提交。

本轮文件（运行代码、测试、文档；已有未跟踪synthetic pilot报告和assets保留未修改）：

```text
NEXT_RELEASE_REPORT.md
docs/V0.2_PILOT_DEPLOYMENT.md
PRODUCT_EXPLANATION.md
README.md
app/index.html
docs/V0.2_ARCHITECTURE.md
index.html
pilot/handler.js
src/ai/developer-transport.js
src/ai/proxy-transport.js
src/ai/schema.js
src/ai/service.js
src/data/backup.js
src/data/db.js
src/data/learning-repository.js
src/data/legacy-migration.js
src/data/reading-repository.js
src/data/training-repository.js
src/domain/documents.js
src/domain/learning.js
src/domain/training.js
src/importers/pdf.js
src/importers/text.js
src/landing.js
src/reader/config-dialog.js
src/reader/learning-tools.js
src/reader/reader.js
src/workspace/components.js
src/workspace/graph.js
src/workspace/main.js
src/workspace/review.js
src/workspace/tools.js
src/workspace/training.js
src/workspace/views.js
tests/browser/next-release.mjs
tests/fixtures/mock-ai-server.mjs
tests/unit/pilot.test.mjs
tests/unit/training.test.mjs
src/domain/context.js
src/styles/upgrade.css
src/workspace/i18n.js
src/workspace/messages-en.js
tests/browser/upgrade.mjs
tests/unit/upgrade.test.mjs
```

---

# 历史交付记录（以下非当前状态）

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
