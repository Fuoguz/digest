# Digest · 课程学习训练工作台

当前版本：**0.2.1 UI & Long-reading Pilot Update**（2026-09-24）。稳定入口：[digest-sigma.vercel.app](https://digest-sigma.vercel.app)。本轮状态及限制见 [NEXT_RELEASE_REPORT](NEXT_RELEASE_REPORT.md)；历史真实模型结果不等于本轮或未来的可靠性保证。

Digest 面向论述型、案例型、材料密集型课程，帮助学生检查“我自己的答案差在哪里”。

课程材料 → 学习任务 → 独立作答 → 具体反馈 → 回原文核查 → 修订 → 保存 Attempt → 以后继续练习。

## 运行与验证

需要 Node.js 22+（本轮使用 24.14.0）。

```sh
npm install
npm start
npm test
npm run qa:browser
node tests/browser/upgrade.mjs
npm run build
```

本地固定入口 http://127.0.0.1:5180/app/ 。不同域名、端口和浏览器不共享本地数据。

升级浏览器测试默认使用构造文本；设置 `DIGEST_TEST_PDF` 为本机 PDF 路径即可实际上传该 PDF。本轮使用用户提供的 Guardian 文章 PDF（14 页，32,285 字符，54 段）。结果与截图留在被忽略的 qa-artifacts，不发布用户材料。

## 使用方式

创建课程 → 在课程中添加材料（自动关联） → 创建问题和可选评价标准 → 先写自己的答案 → 获取反馈 → 核查依据 → 修订。

首次答案先于 AI 保存；失败可以重试。修订追加，不覆盖第一次回答。工作台优先显示未完成任务与最近课程，首次使用有简短步骤引导。Reader 以原文和重点概览为主，细节、旧答案和工具按需展开。

界面支持中文 / English，记住选择，并在切换时保留表单与答案草稿。AI 输出语言可单独选择。原文、用户输入、已有模型结果不会被语言切换翻译或重写。

## 长资料与 AI

- Reader 按最多 10,000 字符的原文分段顺序研读；多段完成后生成整体概览。每次最多 12 段，超过范围请选择原文段落区间；原文完整保留。
- 每段成功后保存本地进度。网络失败、取消或刷新后可复用进度；源版本、范围或输出语言变化会重新开始。未完成的研读不会覆盖旧成功结果。
- 训练反馈按任务、rubric 与答案进行轻量词语检索，最多选取 24,000 字符课程片段；完整源快照用于验证。界面明确显示是否仅检查部分材料。不是跨语言语义检索，也不保证找齐所有相关证据。
- 模型可选择程序提供的原文片段编号；程序取回精确原句，再验证段落、唯一匹配、offset 与 sourceRevision。错误编号、重复引文或版本变化不会伪造跳转。
- 引文存在不等于支持判断。没有可靠依据时明确标注；反馈不代替教师评价，也不声称修订已证明掌握。

生产调用 Browser → 同源 `/api/access` → `/api/digest` → 服务端配置模型。学生只需试用码，不需 API Key。Key 留在服务器环境。开发连接设置保留于本地开发模式，普通 Pilot 路径不突出开发选项。详见 [AI 架构](docs/V0.2_ARCHITECTURE.md) 与 [部署](docs/V0.2_PILOT_DEPLOYMENT.md)。

只有主动请求 AI 时才发送任务、所选材料、答案等必要内容。没有外部行为统计 SDK；本地事件不包含正文或答案。反馈“有帮助 / 不准确 / 依据不相关”只保存反馈 ID 与类型。

## 数据与边界

IndexedDB version 2 与既有全部数据兼容，无清库迁移。Course、Task、Attempt、Feedback、Document、ReadingResult、Evidence、Review、KnowledgeUnit、Relation 保留。删除课程不删除 Library 原文；Graph 与旧主动回忆功能继续可用。

全部学习记录属于当前浏览器/origin，无账号或云同步。设置中可以导出完整 JSON 备份，文件未加密，包含私人正文和答案。恢复只允许空学习库，避免覆盖。已提交答案、反馈、修订与活动可备份；settings 中的未提交草稿、未完成研读进度、开发凭据不在备份内。

答案最多 16,000 字符；极大任务说明与答案组合仍受代理 95,000 字符上下文检查限制。AI 可能慢或失败，每次请求有超时，多段总耗时可能数分钟。可以取消、缩小范围、稍后继续；取消不保证供应商立刻停止计费。

PDF 只支持文本层提取，无 OCR、复杂版面重建，不保存 PDF 二进制。异常字符会提醒检查提取质量。无教师后台、自动评分、掌握率、自动题库、向量库或 Graph RAG。

## 技术结构与发布

继续使用 Vanilla JS / ES Modules；入口 `index.html / src/landing.js` 和 `app/index.html / src/workspace/main.js`。领域在 src/domain，持久化在 src/data，AI 在 src/ai；新样式在 src/styles/upgrade.css，本地化在 src/workspace/i18n.js 与 messages-en.js。

发布前运行测试和构建，然后执行 `node scripts/prepare-pilot.mjs`，仅从 `.pilot-deploy` 上传至已关联的 digest 项目。对外始终使用稳定域名，避免随机部署地址导致学生看不到原来的本地数据。不要改变生产环境变量来解决界面问题。
