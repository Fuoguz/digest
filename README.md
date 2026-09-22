# Digest · 课程学习训练工作台

当前版本：**0.2.1 Preview Pilot**（2026-09-19）。真实模型 10 案例与公网双端闭环已验收；**READY WITH KNOWN NON-BLOCKING LIMITATIONS**，限 5 名受邀学生短材料试用，详见 [NEXT_RELEASE_REPORT.md](NEXT_RELEASE_REPORT.md)。

Digest 面向论述型、案例型、材料密集型课程，帮助学生检查“我自己的答案差在哪里”。

课程材料 → 学习任务 → 独立作答 → 具体反馈 → 回原文核查 → 修订 → 保存 Attempt → 以后继续练习。

## 本地运行

需要 Node.js 22+（本轮使用 24.14.0）。

```sh
npm install
npm start
npm test
npm run build
```

固定使用 http://127.0.0.1:5180/app/ 。不同域名、端口和浏览器不共享本地数据。

首次使用：创建课程 → 用顶部“导入资料”导入 TXT、Markdown、文本层 PDF 或粘贴正文 → 回课程关联材料 → 创建问题与可选评价标准 → 先写自己的答案。首次答案在 AI 调用前保存；失败可以重试。反馈中的依据可打开 Reader 并返回原反馈。修订追加保存，不覆盖首次作答。

## 已实现

- Course、Task、Attempt、Feedback；课程与任务编辑/删除；删除课程不删除 Library 原文或旧学习资产。
- 首次答案、草稿、历史作答、反馈、修订说明与修订历史；Dashboard 优先继续任务。
- Feedback 严格运行时结构校验、安全文本渲染、原文逐字校验、版本失效提示、取消与旧请求保护。
- Reader 四模式研读、原文定位、现有 Active Recall、Knowledge Unit 与用户确认关系的 Graph 均保留。Graph 移至工具区。
- IndexedDB v1 → v2 增量建表，不清库；备份 v2 包含全部已提交学习记录，兼容导入旧 v1 备份。
- 本地 metadata 事件，不记录正文/答案到 analytics，不向外部统计平台发送事件。

## AI 与隐私

生产默认 Browser → 同源 `/api/digest` → Serverless → 服务端配置的模型。普通学生只需试用码，不需 API Key。Key、固定 endpoint/model 与试用码由服务器环境变量配置，见 [Pilot 配置](docs/V0.2_PILOT_DEPLOYMENT.md)。已发布独立 Preview；生产变量值、生产部署与域名保持不变。模型变量增加 Preview target，Preview 使用独立试用码。

本地 loopback 默认 Developer 模式，可在设置中配置兼容 Chat Completions 的服务；此模式的 Key 存在浏览器 localStorage，仅供开发，不进入备份。公网也允许开发者显式切换此模式。普通试用用户应保持 Pilot 模式。

只有主动请求研读/反馈/关系建议时才发送所选内容。训练反馈会发送任务、评价标准、答案、课程名称/说明与所选材料。AI 可以出错；**引用存在不等于它支持 AI 判断**。修订保存不代表学习效果已被验证。

## 数据与边界

全部学习记录属于当前浏览器/origin，无账号或云同步。请在设置导出完整 JSON 备份；文件包含私人正文和答案，未加密。恢复仅允许空学习库，拒绝覆盖或静默合并。未提交的修订草稿留在本地 settings，不包含在备份内。首次答案、已保存修订完整备份。

每个训练任务最多 60,000 字符材料、16,000 字符答案；超限明确拒绝，不静默截断。适用于少量精选材料，不承诺整学期文库检索。暂不自动生成新题、不自动评分、不展示掌握率。可在同一课程手动创建不同案例再检验；同题独立重答入口不展示旧答案。

不做 OCR、Word/PPT 导入、复杂 PDF 版面重建；不保存原 PDF 二进制，只保存提取正文。无教师后台、积分、支付、向量数据库或 Graph RAG。

## 验证与结构

```sh
npm test          # 60 个离线测试，保留原有 40 项
npm run qa:browser
npm run build
```

浏览器 QA 使用独立端口 5193、全新 Chrome context 和明确标记的 mock AI，实际操作 UI、下载文件再上传恢复，不接触真实用户资料库。脚本需要 Playwright 与 Chrome。Playwright 由 npm 安装，默认使用本机已安装的 Chrome；可通过 `DIGEST_BROWSER_CHANNEL` 选择已安装的浏览器通道。截图与结果写入 `qa-artifacts/next-release/`，不进入构建。

运行入口：`index.html / src/landing.js` 与 `app/index.html / src/workspace/main.js`。领域：`src/domain/`；持久化：`src/data/`；AI：`src/ai/`；训练 UI：`src/workspace/training.js`。继续使用 Vanilla JS / ES Modules，无框架迁移。详细结构见 [架构](docs/V0.2_ARCHITECTURE.md)。

2026-09-22 已重新验收，结论为 **READY FOR 5-USER PILOT WITH KNOWN NON-BLOCKING LIMITATIONS**；13个新真实模型案例及局限见 [最新验收报告](docs/PILOT_ACCEPTANCE_2026-09-22.md)，历史批次见 [早期报告](docs/V0.2.1_REAL_MODEL_ACCEPTANCE.md)。本轮只补验收工具和文档，未扩产品功能。Preview 需要私人分享入口及试用码，不要将邀请信息提交到 Git。资料仅属于同一浏览器/origin。
