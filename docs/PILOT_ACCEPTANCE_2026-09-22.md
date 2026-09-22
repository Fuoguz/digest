# Digest 0.2.1 — fresh Pilot acceptance, 2026-09-22

**READY FOR 5-USER PILOT WITH KNOWN NON-BLOCKING LIMITATIONS**

范围：5 位受邀学生、精选可核对文本、探索性学习训练，不是自动评分或广泛准确性认证。本轮未改产品源码、数据库或部署配置，未扩功能。

## Identity and method

- 开始时 HEAD / origin/codex/digest-v02：`ece4b735f7c743bb2c8aaa492da7a0106930faa5`，工作树 clean；main/origin main 仍为 `7f0bf19053346d70979d3918779a6e8788f937ab`。
- Preview：[digest-rfu0e349k-fuoguzs-projects.vercel.app](https://digest-rfu0e349k-fuoguzs-projects.vercel.app)，部署 `dpl_4JMA65M3afa1zk3qBUG6cXAmCA9Q`，READY；产品源码 `0708820ff0006c467b38c3a7c6b847fd71fbab6b`。之后的提交只涉及测试/交付文档。
- 重新验证 Vercel 登录、Preview 状态、环境变量 target、Production 身份；服务端仍使用 `MODEL_API_KEY / MODEL_API_BASE_URL / MODEL_NAME`，模型 `alibaba/deepseek-v4.1-flash`。普通用户使用试用码，不读取模型 Key。
- 13 个案例（5 Reading、8 Feedback），14 次实际模型请求：P1 发生一次产品已有的结构修复。另有两轮双端 UI，共 4 次真实 Feedback 调用；本轮合计 18 次模型请求，没有规模化压测。
- 先写 `tests/fixtures/pilot-acceptance-20260922.mjs` 中 checklist，后调用模型；checklist 不发给模型。模型只接收学生任务、rubric、答案与材料。语义审阅由本次 Codex 逐条对照完成，**不是独立教师盲审**。
- 原始结果、逐条 anchors/offset/version、截图与下载文件在忽略目录 `qa-artifacts/pilot-20260922/`，不部署、不提交私人访问配置。

## Materials and prewritten Critical Content Checklists

| 材料 / 使用案例 | 核心概念、条件、边界与必须核查的证据 |
|---|---|
| 编写的中文研究方法教学材料 / G1、F2 | 成绩提高只是观察；非随机且无对照；单校自选样本不能直接推广；同期教学/重复测验影响未量化 |
| 编写的传播学教学材料 / G2、F1、F4 | 议程设置关注重要性、框架关注解释；两者可共存；失业报道例子；可能性不等于已证明的受众效果 |
| [Lost in the Middle 摘要短摘录](https://arxiv.org/abs/2307.03172) / A1 | 位置变化可能降低表现；长上下文模型也有此限制；摘录未提供实验设置、指标或作者研究局限。只有 22 个原文词，不是完整论文验收 |
| 明确标记虚构的迟到承诺教学案例 / L1、F3 | 到达日期而非寄出；迟到且未及时认可；及时认可例外；只适用给定规则，不补造真实判例/邮寄例外 |
| [生成式 AI 办法第二、三条](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm) / P1、F5、F6、F7 | 向境内公众提供服务；未面向公众的研发应用例外；发展安全并重是规范目标；无效果统计、无统一罚款金额；可辩护观点不应被当错误 |
| [个人信息保护法 2021 年公布文本](https://www.miit.gov.cn/jgsj/zfs/fl/art/2022/art_515a4b20c12f430eab54bb4f56d89f56.html) / LONG | 第4条匿名化排除；第13条非同意基础；第28条严格保护；第54条定期不等于每月；第72条个人家庭事务例外；第74条施行日 |

任务分别覆盖完整正确、部分正确、遗漏条件、概念混淆、无依据推论、可辩护不同观点与材料不足。真实来源材料和编写的压力样本分开标注；没有宣称已拿到真实学生答案。

## A–H case review

A=结构；B=quote/段落/offset/source version；C=语义支持；D=关键遗漏；E=材料边界；F=是否忠实理解原答；G=修改动作；H=幻觉。PASS/PARTIAL 是该次样本判定，不是模型准确率。

所有匹配引用均逐字、段落、UTF-16 offsets 与 sourceRevision 一致。139 个候选中 138 matched、1 invalid；invalid 没有伪造 offset，也不能成为有效原文跳转。所有非空用户答案引用都通过原答连续子串验证；缺失内容使用 null。

| Case | A / B | C 与 D | E：材料 / 模型边界 | F 与 G | H / 结论 |
|---|---|---|---|---|---|
| G1 中文 General | PASS；14/14 | 保留观察、因果与外推限制、替代解释，清单无关键遗漏 | Material-backed；因果谨慎标 inference，非直接材料事实 | 不涉及用户答案；复习题可从原文回答 | None / PASS |
| G2 中文 General | PASS；35/35 | 概念、共存和假设边界齐全；个别洞见把调查/实验说成必须的证据门槛，强于材料 | Material-backed + Model-added 泛化，虽标洞见仍需审慎 | 不涉及原答；复习题可答，内容重复偏多 | Minor（过度泛化）/ PARTIAL |
| A1 English Academic | PASS；8/8 | 保留位置敏感与长上下文限制；未补造实验，未漏摘录检查点 | Material-backed；方法/数据/作者研究局限为 Not covered by material；评测建议标洞见 | 不涉及原答；复习问题含材料未提供什么，可核查 | None / PASS |
| L1 Legal Case | PASS；25/25 | 日期、及时认可例外、结论范围均正确，无关键遗漏 | Material-backed；明确教学虚构，不伪装判决 | 不涉及原答；规则与事实题可答 | None / PASS |
| P1 Policy Document | 首次结构不合格→已有一次修复后 PASS；24/24 | 适用范围、公众条件、例外均保留；目标未当成实施效果 | Material-backed；时间、执行细节未提供；推论单独标记 | 不涉及原答；复习题可答。修复使全案约125秒 | None；结构稳定性 PARTIAL |
| F1 完整正确 | PASS；4/4 | 完整概念、例子与效果限制得到认可，gaps=[] | Material-backed；没有强加材料外要求 | 忠实保留“可能/假设”；明确无需结构性补缺 | None / PASS |
| F2 部分正确 | PASS；4/4 | 肯定观察和外推限制，指出遗漏随机/对照与替代解释 | Material-backed | 没说用户否认成绩提高；要求补因果边界，具体可行 | None / PASS |
| F3 缺关键条件 | PASS；5/5 | 肯定日期/结论，补及时认可例外及其不满足事实 | Material-backed | 没把正确结论判错；补规则与例外，方向正确 | None / PASS |
| F4 概念颠倒 | PASS；4/5 matched，1 invalid | 准确指出两个例子颠倒；一条候选把原文分号改句号，被验证器拒绝；仍有有效定义与完整例子 | Material-backed；无新效果事实 | 用户引用准确；把显著性/解释归位，可执行 | Minor（错误引文已拦截）/ PARTIAL |
| F5 无依据50% | PASS；2/2 | 正确指出目标不能证明事故降幅；另说“没有直接回答问题”偏苛刻，原答已有肯定立场 | Not covered by material；无数据 gap 标 no_evidence；原理引用不冒充统计证据 | 主批评准确；额外缺口轻微误读；删绝对断言并指出缺证据有帮助 | Minor（附加批评不准）/ PARTIAL |
| F6 可辩护观点 | PASS；5/5 | 认可未必冲突和推论标签，不强制唯一答案；仍要求重复限定、补更细推理 | Material-backed 原则 + 明确待验证推论；未冒充效果 | 用户的“可能/推论”被承认；建议偏苛刻但未将观点判错 | None；反馈校准 PARTIAL |
| F7 材料不足 | PASS；0候选 | 无金额，拒绝十万元，不制造不存在的支持出处 | Not covered by material / no_evidence | 准确指出原答问题；删金额、说明节选未规定 | None / PASS |
| LONG 真长文本 | PASS；8/8 | 六项错误全部发现，含中段严格保护与末尾例外/日期，无清单关键遗漏 | 主要 Material-backed；建议中称8月20日为“公布日期”是未由输入支持的 Model-added，未单独标注。正确施行日仍由74条支持 | 六个答案片段准确；逐条定位修订可行；敏感信息额外告知建议可在30条找到，但现有该条 Gap 未直接引用30条 | Minor（日期背景未标补充）/ PARTIAL |

结果：**7 PASS / 6 PARTIAL / 0 FAIL**。没有 Major hallucination 或阻塞性关键遗漏。PARTIAL 的具体问题保留在上表，不把全部案例包装成无误。P1 初次原始失配输出未单独保存，无法回溯具体字段；14次调用日志和产品只允许一次修复的路径确认发生修复。

## Long-document behavior

真实官方文本第1–74条，9,341字符、181段，不靠复制填充加长。提取保留全部条文；fixture 与进入 feedbackMessages 的各段重新拼接逐字相等。当前流程无 chunking、检索或静默截断，任务材料超过60,000字符明确拒绝。答案核查片段最多80句，但完整答案仍同时传入。

LONG 用一次请求约45.4秒完成；证据位于零基段落7、28、59、60、113、158、173、180。最后一条引用结束 offset=9341，等于源文本末尾。没有只处理前部或跳过本次六项检查点的迹象。**这不证明74条全部命题均被覆盖**，不证明更长论文、PDF图表或60k边界的语义质量。

Reader 的数字统计是生成判断中有可定位引用的数量，现有 UI 明示“原文依据可定位不代表 AI 推论必然成立”。不能拿该数字当原材料覆盖率。此次没有发现虚报任务成功：出错状态保留答案并允许重试。

## Fresh tests / public E2E

- `npm test`：60 passed / 0 failed；`npm run build`：通过；本轮产品无修改。
- `npm run qa:browser`：16 checks passed，包含1440/1024/768/390、旧与新十种学习数据的真实下载/空环境上传恢复、Evidence、移动Review、取消、错误输出和长文本。
- 公网真实模型：两轮均完成1440和390的 Course→真实政策文本→Task→首次回答→Feedback→Evidence→返回→Revision→完成→刷新；新标签页及课程入口可继续，原答保留。
- 模拟 HTTP400/429/500/503/504、网络失败、malformed、truncated JSON、缺字段、空回复；无假反馈完成，刷新后可重试；慢请求取消保留答案。独立最终故障回归 **15 checks passed**。
- 双击原生提交按钮：一个 Attempt、一次请求。公网实际 IndexedDB 仓储拒绝旧请求及已取消请求写入，原答、已保存Revision与旧Feedback逐字段不变；这是已部署仓储测试，不冒充两个真实供应商响应乱序。
- 实际服务器401/200/400/405重新验证；已部署客户端通过注入50ms期限验证超时提示。没有声称真实等满175秒或逼供应商产生真实429/5xx。
- 公网浏览器真实下载备份→新空context→上传→回到Evidence与Revision→再次下载：所有学习字段一致，旧activities保留；临时请求ID依设计清为null。公网备份中ReadingResult/Review/KnowledgeUnit/Relation为空；这些非空旧数据由上述16项本地浏览器恢复验证覆盖。
- 恢复后的1440/390公共页面无横向溢出、无未捕获JS异常、无资源404。公开QA结果组合在public/real-results.json、failure-results.json、restore-results.json。前两轮集成脚本遇到测试断言问题，详见下段，不能把其退出码写成全绿。

测试工具修正：首次重复提交测试直接dispatch两个submit事件，绕过禁用按钮，产生两个Attempt；改为原生button.click两次才模拟实际连续点击。第二轮完整UI成功后，备份比对将新增null临时字段误判差异；按实际恢复合同调整，只规范化临时ID，所有学习字段仍严格比较，并负测了原答篡改/旧事件丢失均会失败。用已下载真实备份完成补测，避免为测试工具问题继续调用收费模型。最终故障与恢复脚本退出码均0，无产品修补。

## Remaining P0/P1 and Pilot decision

**本次选定范围内未发现剩余P0/P1 blocker。** 不修改非阻塞的重复建议、过细批评或次要UI。现有证据只能支持受邀探索性Pilot，不能支持完全自动阅卷或无人监督法律判断。

非阻塞边界：英文只有短摘录；法律案例是教学构造；一份9.3k文本不足证明长课程能力；无独立教师盲审/真实学生效果数据；普通PDF提取不保证扫描页与图表完整、无OCR；模型延迟有波动；本地数据需备份且绑定同一origin；邀请入口有效期需按计划续发。现有实例内限流不是跨实例费用硬预算，本轮没有核实供应商硬上限。

Pilot准备：5位学生各带一份精选可核对材料、真实问题和可选rubric；使用同一Preview域名与私人入口；提前告知AI传输和本地备份；记录首次答案、接受/拒绝了哪条反馈、查看哪段依据、实际改了什么；由教师或研究者复核关键反馈；数日后用人工选定不同案例再答。停止新增功能，先观察有效修订和再次使用。
