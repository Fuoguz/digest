# Digest 架构与规范文档

版本: v1.0
状态: 生效中
适用阶段: 单文件 MVP 向 SaaS 级架构迁移
最后更新: 2026-05-02

## 1. 文档目的

本文件是 Digest 项目的核心工程约束文档，用于统一以下事项：

- 架构演进方向
- 目录结构与文件归属
- 模块职责边界
- 开发命名和错误处理规范
- 未来新增功能前的上下文对齐基线

执行原则：任何新功能开发前，先阅读本文件，再进行设计与实现。

## 2. 项目愿景与当前技术栈

### 2.1 项目愿景

Digest 的目标不是做一个通用摘要器，而是构建一个可持续演进的知识内化系统：

- 输入层：接收多源信息并完成文本清洗
- 推理层：通过 Agent Loop 生成结构化认知结果
- 沉淀层：将结构化结果转化为可复习的知识节点
- 编织层：通过图谱可视化长期认知网络
- 复习层：通过间隔复习机制驱动长期记忆

中长期目标：从纯前端本地工具演进为可多端协作、可扩展插件、可观察可治理的 SaaS 产品。

### 2.2 当前技术栈

当前版本为浏览器端单页应用，核心技术如下：

- 前端基础: HTML5, CSS3, Vanilla JavaScript
- 可视化: D3.js v7
- 海报导出: html2canvas
- 存储: Browser LocalStorage
- AI 调用: Chat Completions 风格接口 + Tool Calling

当前工程特征：

- 页面结构主要在 index.html
- 业务逻辑主要集中在 app.js
- 视觉与动效主要集中在 style.css
- 无构建流程、无服务端、无模块分包

## 3. 当前架构现状总结

现有代码已包含以下关键能力：

- 多源输入: 粘贴、URL、Markdown、选区导入
- Agent Loop: 模型多轮推理 + 工具调用 search_local_knowledge 与 format_output
- 输出结构化: 核心论点、核心论据、认知框架、复习问题
- 质量检查: 完整度、置信度、偏题风险
- 本地沉淀: digest_nodes 的读写、标准化、标签抽取
- 复习调度: 1/3/7/14/30 天间隔复习
- 图谱系统: D3 力导向图、hover 联动、时间机回放
- 导出能力: PNG 海报、Markdown 复制

已验证的图谱相关约束（仓库记忆）：

- 图谱必须保持零种子，不允许默认 seed 节点写入存储
- 读取历史数据时需过滤 legacy seed-* 节点
- 图谱重渲染必须停止旧 simulation 与旧 interval，避免脏状态
- 图谱重构不得破坏导出流程与输入锁定逻辑

## 4. 目标目录结构规范

以下目录规范用于后续迁移，允许分阶段落地。新增文件必须符合归属规则。

建议目标结构：

- src/
  - app/
    - bootstrap.js
    - router.js
    - lifecycle.js
  - ui/
    - pages/
    - components/
    - states/
    - animations/
  - features/
    - input/
      - sourceSwitcher.js
      - sourceImporters/
    - digest/
      - digestController.js
      - digestPresenter.js
      - quality/
    - review/
      - reviewScheduler.js
      - reviewBoard.js
    - graph/
      - graphController.js
      - graphRendererD3.js
      - graphTimeMachine.js
    - export/
      - exportPoster.js
      - exportMarkdown.js
  - domain/
    - digestNode/
      - model.js
      - normalize.js
      - tags.js
    - review/
      - policy.js
  - services/
    - llm/
      - client.js
      - agentLoop.js
      - tools/
        - searchLocalKnowledge.js
        - formatOutput.js
    - storage/
      - localStorageAdapter.js
      - repositories/
        - digestRepository.js
  - infra/
    - env/
    - logger/
    - error/
    - telemetry/
  - shared/
    - constants/
    - utils/
    - types/
- public/
  - index.html
  - assets/
- docs/
  - ARCHITECTURE.md
  - ADR/
- tests/
  - unit/
  - integration/
  - e2e/

### 4.1 目录归属规则

- 与页面元素强绑定的渲染逻辑放 ui 或对应 feature 的 presenter
- 业务编排逻辑放 features 下的 controller
- 可复用领域规则放 domain
- 与外部交互（模型、存储、网络）放 services
- 环境、日志、错误、监控放 infra
- 常量、通用函数放 shared

### 4.2 禁止事项

- 禁止新功能继续堆叠到 app.js 顶层
- 禁止跨模块直接操作彼此内部状态
- 禁止在 UI 层拼接复杂业务规则
- 禁止在 domain 层发起网络请求

## 5. 核心模块职责边界

本节定义四条必须长期稳定的边界：UI 渲染、模型通信、本地存储、图谱渲染。

### 5.1 UI 渲染边界

职责：

- 负责展示状态与用户交互
- 负责 DOM 绑定、状态到视图映射、基础交互反馈

不负责：

- 不负责直接请求模型
- 不负责持久化策略
- 不负责图谱力学参数决策

输入与输出：

- 输入: 由 controller 提供的 view model
- 输出: 标准化用户意图事件（如 analyzeClicked, sourceImported）

### 5.2 大模型 API 与 Agent Loop 边界

职责：

- 负责模型请求生命周期
- 负责 tool-calling 循环
- 负责协议收敛到结构化输出

不负责：

- 不负责 UI 细节渲染
- 不负责直接操作 LocalStorage

边界要求：

- 对外暴露单一入口，如 runDigestAgent(input, context)
- 保证返回结构已标准化（mainPoint, arguments, framework, question）
- 严禁在服务层写死密钥，密钥必须通过环境注入

### 5.3 本地数据存储边界（LocalStorage）

职责：

- 负责 digest_nodes 的读写、迁移、标准化
- 负责数据兼容（旧版本字段补齐、异常兜底）

不负责：

- 不负责业务编排
- 不负责渲染

边界要求：

- 所有存储访问必须通过 repository 或 adapter
- 统一 key 管理，不允许散落硬编码
- 读操作必须返回 normalize 后的数据

### 5.4 图谱渲染边界（D3）

职责：

- 负责图谱渲染、仿真、交互高亮、时间机动画

不负责：

- 不负责决定哪些节点应入库
- 不负责业务规则（复习调度、标签规则）

边界要求：

- 渲染前先清理旧 simulation 与 interval
- 图谱输入必须是纯数据（nodes, links），不可直接读写业务状态
- 图谱模块不得改写存储结构

## 6. 状态管理规范

当前是轻量本地状态，未来迁移建议采用分层状态模型：

- 页面状态: loading, activeSource, resultVisible
- 业务状态: digestResult, reviewQueue, graphData
- 持久状态: digestNodes

规则：

- 同一状态只允许一个模块作为单一事实来源
- 视图层不直接修改持久状态
- 所有状态变更需经命名明确的 action 或函数

## 7. 开发与命名规范

### 7.1 通用命名

- 变量与函数: camelCase
- 常量: UPPER_SNAKE_CASE
- 类名: PascalCase
- 文件名: kebab-case 或语义 camelCase，项目内保持一致

### 7.2 语义命名要求

- 事件处理函数使用 handle 前缀，如 handleReviewAction
- 布尔变量使用 is/has/can 前缀，如 isLoading, hasDigestResult
- 构建函数使用 build/create 前缀，如 buildGraphDataFromStorage
- 标准化函数使用 normalize 前缀，如 normalizeDigestNode
- 渲染函数使用 render 前缀，如 renderReviewBoard

### 7.3 禁止命名

- 禁止使用 data1、tmp、foo、bar 等弱语义命名
- 禁止同一语义多套命名并存（如 reviewList 和 reviewsQueue 混用）

## 8. 错误处理与日志规范

### 8.1 错误分层

- 用户可恢复错误: 输入为空、权限不足、网络抖动
- 业务错误: 协议字段缺失、结构不合法
- 系统错误: 运行时异常、依赖不可用

### 8.2 处理原则

- 所有异步边界必须有 try/catch
- catch 中必须至少做两件事：记录日志 + 用户可理解提示
- 日志信息要带上下文，不记录敏感信息
- 不允许静默吞错

### 8.3 用户提示

- 面向用户的错误信息必须说明下一步动作
- 同类错误提示文案统一，不在多个模块重复发散

## 9. 安全与配置规范

- 严禁在仓库中硬编码 API Key
- 所有敏感配置必须通过环境变量或安全配置层注入
- 外部请求需有超时、失败重试或降级路径
- 对模型返回内容做结构校验，禁止直接信任

## 10. 测试与质量门槛

当前项目尚未建立测试体系，迁移阶段必须逐步补齐：

- 单元测试: domain 规则、normalize、review 调度
- 集成测试: agentLoop 到结构化输出链路
- 端到端测试: 输入到结果展示到沉淀回看

建议最低门槛：

- 核心领域逻辑覆盖率优先达到 80%
- 每次重构图谱模块必须回归验证四项能力：渲染、hover、时间机、复习联动

## 11. 迁移路线（建议）

### 阶段 A: 拆分不改行为

- 从 app.js 抽出 services/storage 与 domain/normalize
- 保持 UI 行为不变，先完成可读性和边界清晰化

### 阶段 B: 建立服务边界

- 抽离 agentLoop 与 llm client
- 移除 UI 对 fetch 细节的直接依赖

### 阶段 C: 图谱模块化

- 拆分 graphController、graphRendererD3、graphTimeMachine
- 固化图谱输入输出协议

### 阶段 D: 工程化与 SaaS 化准备

- 引入构建工具与多环境配置
- 接入服务端网关、鉴权与观测能力

## 12. 变更流程规范

- 任何新增功能先定义影响模块与边界
- 跨模块改动需在 PR 描述中写明边界变化
- 如边界规则发生变化，必须同步更新本文件

建议在 docs/ADR 中记录关键架构决策，形成可追溯历史。

## 13. 本文档的执行优先级

本文件是当前项目架构约束的最高优先级文档之一。

当出现以下冲突时，优先级如下：

- 安全规范 > 架构边界 > 功能速度
- 可维护性 > 临时捷径
- 文档约束 > 个人习惯

后续每次新增功能前，默认先阅读本文件以保持上下文对齐。
