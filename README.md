# Digest · 沉淀

面向高校学生的 AI 研读与复习工作台，将课程资料、论文、案例和政策文本转化为可追溯、可复习、可关联的长期知识资产。

## v0.2 Core

- Library：导入文本、Markdown、带文本层的 PDF；搜索、标签/类型/模式筛选、收藏与待复习筛选。
- Reader：四种研读模式；资料陈述、AI 推论、可复用洞见分别展示；点击可靠 Evidence 精确定位原文。
- Review：从 Reader 选择问题，先回忆再揭示，可核查来源，Again / Hard / Good / Easy 按题安排下一次复习；暂停/恢复题目。
- Knowledge Units：用户确认后沉淀知识点，保留 Document / Reading Result / Claim / Evidence；支持改名、取消沉淀。
- Semantic Graph：AI 提议、用户确认/拒绝；只有确认关系入图。展示方向、类型、理由，支持搜索、标签筛选与来源核查；允许孤立节点。
- Dashboard、全库搜索、设置与不含 Key 的 JSON 备份；可在空资料库恢复。

当前真实模型验收待执行。自动测试和浏览器完整流程使用明确标记的 mock；它们验证交互、校验与持久化，不证明模型判断正确。详见 [真实模型验收](docs/V0.2_REAL_MODEL_ACCEPTANCE.md) 与 [发布报告](docs/V0.2_RELEASE_REPORT.md)。

## 运行

需要支持 ES Modules 的现代浏览器与 Node.js 22+（本次验收为 Node.js 24）。

    npm install
    npm start

打开 http://127.0.0.1:5180/ 。官网在 `/`，工作台在 `/app/`。请使用 HTTP 服务，不要直接双击 HTML。

    npm test
    npm run build

测试离线运行，不要求 AI Key。构建输出 `dist/`；部署时仅发布 dist，并将 `/app/*` 路由回退至 `app/index.html`。本地服务仅监听 loopback。

## AI 配置

资料导入与阅读不需要 AI 配置。点击 Reader 的分析按钮，或设置中的 Developer AI Service，填写兼容 OpenAI Chat Completions 的 endpoint / model / Key。服务必须允许浏览器 CORS，并支持 JSON 输出。一次分析请求，结构错误最多一次修复；关系建议为独立显式请求。

Developer Mode 的 Key 保存在当前浏览器 localStorage；不会打包进代码或 JSON 备份。只有用户发起分析时才发送当前正文，关系建议只发送筛选后的知识点及可靠引文。Production API Proxy、账号和云同步未实现。

## 数据与恢复

IndexedDB 数据仅属于当前浏览器与 origin（协议、主机、端口）。不同端口、localhost 与 127.0.0.1 不共享资料。请固定使用一个地址，并在设置中定期导出 JSON 备份。备份恢复只允许空资料库，失败不写入、不覆盖现有记录。

旧 Demo 数据保留原 localStorage key；迁移只提取已有内容，缺原文标记 legacy_incomplete，不伪造依据、问题或图谱。迁移备份路径继续保留。

## 开发结构

- `src/workspace/`：路由、Dashboard/Library、Review、Graph、Search/Settings。
- `src/reader/`：原文/AI 双栏、安全文本渲染、Evidence、学习动作。
- `src/ai/`：四模式 runtime schema、一次研读服务、DeveloperTransport、取消控制。
- `src/domain/`：Document、Evidence、复习调度、关系校验。
- `src/data/`：IndexedDB、原子研读/学习事务、备份、旧数据迁移。
- `src/importers/`、`src/styles/`、`vendor/`：文本/PDF、设计系统、本地 D3/PDF.js。
- `tests/unit/`：离线关键逻辑；`tests/fixtures/`：明确隔离的 mock，不进入构建。

独立浏览器 QA：运行 `node tests/fixtures/mock-ai-server.mjs` 后访问 http://127.0.0.1:5185/app/ ，仅在此测试 origin 配置 `http://127.0.0.1:5185/success/v1`、任意 mock 模型名和 `fixture-only`。不得将 mock 结果称为真实模型验收。

## 边界

不包含 OCR、Word/PPT、复杂 PDF 版式重建、FSRS、向量库、账户、支付、协作或云同步。原始 PDF 二进制不持久化，保存的是提取正文及 metadata。JSON 备份不加密，请自行妥善保管。
