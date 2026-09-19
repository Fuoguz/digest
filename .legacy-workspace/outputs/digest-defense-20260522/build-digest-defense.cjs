const fs = require("fs");
const path = require("path");
const PptxGenJS = require("pptxgenjs");
PptxGenJS.ShapeType = { line: "line", rect: "rect" };

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = __dirname;
const ASSETS = path.join(OUT, "assets");
const TEMPLATE = "C:/Users/11487/.codex/skills/guizang-ppt-skill/assets/template-swiss.html";
const TITLE = "沉淀 Digest 大学生创新创业训练计划创业训练项目答辩";
const DATE = "2026.05";
const TOTAL = 12;

const slides = [
  {
    no: 1,
    layoutId: "S01",
    animate: "hero",
    theme: "accent",
    kicker: "STARTUP TRAINING · AI + EDUCATION",
    title: "沉淀 Digest",
    subtitle: "面向高校学生的 AI 知识内化与自主学习能力提升平台",
    core: [
      "项目类型：大学生创新创业训练计划 · 创业训练项目",
      "负责人：张少毅 · 上海纪录片学院网络与新媒体",
      "指导教师：施州 · 讲师"
    ],
    layout: "瑞士风封面页，IKB 克莱因蓝满屏背景，左上放项目类别，中央放项目名与一句定位。",
    image: "使用抽象点阵或代码网格背景，不放复杂图片；如答辩现场允许，可叠加产品首页截图作半透明底纹。",
    notes: "开场用 20 秒说明项目一句话定位：沉淀 Digest 不是单次摘要工具，而是面向高校学习场景的 AI 知识内化平台。点出本项目属于创业训练项目，答辩重点会围绕用户需求、产品原型、商业模式和实施可行性展开。"
  },
  {
    no: 2,
    layoutId: "S09",
    animate: "statement",
    theme: "light",
    kicker: "PROBLEM · LEARNING OVERLOAD",
    title: "大学生不是缺资料，而是缺内化路径",
    subtitle: "课程资料、论文、网页和项目素材不断增加，学生真正困难的是提炼重点、保持记忆和复用知识。",
    core: [
      "信息过载：资料渠道增多，但阅读后难以形成结构化理解",
      "笔记分散：Word、微信收藏、网盘、书签和笔记软件相互割裂",
      "复习低效：多数 AI 工具停留在一次性问答，缺少长期复习闭环"
    ],
    layout: "大标题宣言页，左上标题，右侧用 3 个痛点标签形成视觉锚点。",
    image: "配图建议：高校学生多窗口学习桌面、论文/网页/笔记并列的俯视图，或资料碎片汇聚成节点网络的信息图。",
    notes: "这一页要把评委带入真实场景：学生获得信息很容易，但真正把内容变成自己的知识很难。强调痛点不是泛泛的学习效率问题，而是资料处理、知识留存和复习路径的问题。"
  },
  {
    no: 3,
    layoutId: "S04",
    animate: "grid-reveal",
    theme: "grey",
    kicker: "TARGET USERS · CAMPUS SCENARIOS",
    title: "目标用户聚焦高校高频学习任务",
    subtitle: "先从本校学生可触达场景验证，再逐步扩展到课程、论文、项目和竞赛。",
    core: [
      "课程学习：课堂资料、教材章节、课件要点整理",
      "论文阅读：文献摘要、论点拆解、证据归纳",
      "考试复习：主动回忆问题、间隔复习提醒",
      "项目研究：调研资料、案例材料、汇报素材沉淀"
    ],
    layout: "六宫格场景页，4 个主场景 + 2 个拓展场景，适合高校答辩快速扫描。",
    image: "配图建议：每个格子用线性图标表示课程、论文、考试、项目、法学案例、新闻传播阅读。",
    notes: "说明项目从高校学生的真实学习任务出发，而不是泛化做一个 AI 工具。可以补一句：上海政法学院的新文科、法学案例阅读、政策文本解读和新闻传播课程阅读，都为校内试点提供了具体场景。"
  },
  {
    no: 4,
    layoutId: "S14",
    animate: "loop-form",
    theme: "light",
    kicker: "SOLUTION · KNOWLEDGE INTERNALIZATION LOOP",
    title: "产品方案：把一次阅读变成可复习的知识资产",
    subtitle: "Digest 将输入内容拆解为摘要、观点、证据、复习问题和知识节点，并通过图谱建立长期连接。",
    core: [
      "内容输入：文章、网页、课程资料、Markdown 文本",
      "AI 解析：结构化摘要、核心观点、论据整理",
      "知识沉淀：节点保存、知识图谱、复习问题与后续回顾"
    ],
    layout: "左侧 4 步闭环列表，右侧环形流程图，突出“输入-理解-沉淀-复习”的连续性。",
    image: "配图建议：用简洁流程图表达学习闭环，不需要写实照片；可用节点网络作为右侧辅助图。",
    notes: "这一页是产品核心。强调与通用 AI 问答的区别：Digest 不追求比大模型更强，而是把现有 AI 能力嵌入学习流程，让学生完成从阅读到复习的闭环。"
  },
  {
    no: 5,
    layoutId: "S22",
    animate: "image-hero",
    theme: "light",
    kicker: "PROTOTYPE · GITHUB FOUNDATION",
    title: "已有前端网页原型与 GitHub 项目基础",
    subtitle: "当前项目已具备可展示、可迭代的产品基础，包含首页、输入区、学习闭环和知识图谱模块。",
    core: [
      "前端原型：HTML/CSS/JavaScript，可在本地或 GitHub Pages/Vercel 部署",
      "核心模块：AI 内化分析、知识节点、D3 知识图谱、本地存储",
      "迭代基础：已形成 README、模块化源码和基础测试目录"
    ],
    layout: "S22 图片证据页，上方放产品截图，下方用三列说明证明“不是纸面方案”。",
    image: "使用当前 Digest 原型截图：outputs/digest-defense-20260522/assets/digest-prototype-after-enter.png。",
    imageFile: "digest-prototype-after-enter.png",
    notes: "这里要主动展示项目已有基础。建议答辩时打开 GitHub 或本地页面作为备用演示；若时间有限，就用截图说明已经有可运行界面、模块化代码和产品表达能力。"
  },
  {
    no: 6,
    layoutId: "S08",
    animate: "duo-mirror",
    theme: "grey",
    kicker: "DIFFERENTIATION · NOT ANOTHER SUMMARY TOOL",
    title: "差异化：从“回答问题”转向“形成知识结构”",
    subtitle: "项目核心竞争力不在大模型本身，而在高校学习流程理解、知识沉淀机制和低门槛产品体验。",
    core: [
      "通用 AI：快速回答、一次性摘要、结果依赖 prompt",
      "Digest：结构化输出、复习问题、知识节点、图谱沉淀",
      "笔记工具：依赖手动整理；Digest 通过 AI 降低整理门槛"
    ],
    layout: "左右对比页，左侧为通用 AI/传统笔记局限，右侧为 Digest 闭环优势。",
    image: "配图建议：对比图或 Before/After 图；左侧为散乱资料，右侧为节点化知识结构。",
    notes: "这一页回答评委可能提出的“为什么不用 ChatGPT/Kimi/Notion AI”问题。表达要克制：不是说它们不好，而是它们没有专门围绕高校学生长期学习闭环设计。"
  },
  {
    no: 7,
    layoutId: "S16",
    animate: "field-notes",
    theme: "light",
    kicker: "USER RESEARCH · VALIDATION PLAN",
    title: "用户调研：用校内真实场景验证需求",
    subtitle: "项目实施将通过问卷、访谈、竞品分析和小范围试用，验证使用意愿、功能优先级和付费可能性。",
    core: [
      "问卷调查：课程资料、论文阅读、AI 工具使用现状",
      "用户访谈：学习痛点、复习习惯、资料复用方式",
      "校内试用：收集反馈，迭代摘要、问题生成和图谱展示"
    ],
    layout: "三行两列研究计划页，分别呈现调研对象、方法、产出、指标和迭代动作。",
    image: "配图建议：问卷结果柱状图、访谈便签墙、校内试用反馈截图。",
    notes: "突出创业训练的过程性：不是先假设市场成立，而是通过本校可触达样本完成低成本验证。说明成员分工里已有用户调研和数据整理负责人。"
  },
  {
    no: 8,
    layoutId: "S19",
    animate: "four-cards",
    theme: "grey",
    kicker: "BUSINESS MODEL · MONETIZATION",
    title: "商业变现：免费入口 + 高阶能力付费",
    subtitle: "面向高校学生，采用轻量订阅与学习服务组合，先验证持续使用，再探索校园社群和团队场景。",
    core: [
      "基础功能免费：降低首次使用门槛，积累真实反馈",
      "高阶订阅：更多知识节点、导出、复习计划、图谱能力",
      "资料整理服务：课程复习包、学习资料结构化整理",
      "团队项目服务：调研材料、汇报素材、项目知识库协作"
    ],
    layout: "四卡商业模式页，每张卡对应一条收入路径，右上角用小标签区分短期/中期。",
    image: "配图建议：商业模式画布简化图，或从免费到付费的阶梯式漏斗图。",
    notes: "这里要讲清楚创业训练可行性：不是立刻大规模商业化，而是在校园低成本试点中验证付费点。评委关心的是商业意识、变现假设和验证路径。"
  },
  {
    no: 9,
    layoutId: "S11",
    animate: "timeline-walk",
    theme: "light",
    kicker: "ROADMAP · 2026.06 - 2027.04",
    title: "一年实施路径清晰，可形成阶段成果",
    subtitle: "项目周期从 2026 年 6 月到 2027 年 4 月，按“调研-开发-试用-报告-答辩”推进。",
    core: [
      "2026.06-08：资料查阅、方案设计、功能优先级确定",
      "2026.09-11：问卷访谈、竞品分析、校内试用启动",
      "2026.11-2027.01：原型优化、数据处理、中期检查",
      "2027.01-04：创业报告、展示视频、结项答辩与推广"
    ],
    layout: "横向时间线页，5 个节点对应项目执行环节，便于答辩快速说明进度。",
    image: "配图建议：时间轴或甘特图，不使用复杂项目管理截图。",
    notes: "说明一年周期可落地，因为项目不以自研大模型为目标，而是基于已有原型与现有 AI 能力做场景化产品验证。"
  },
  {
    no: 10,
    layoutId: "S20",
    animate: "stacked-ledger",
    theme: "grey",
    kicker: "BUDGET · 15,000 RMB",
    title: "经费安排服务于开发、验证和展示",
    subtitle: "项目经费 15000 元，重点投向产品原型优化、AI API 调用、用户调研、测试推广和答辩展示。",
    core: [
      "产品开发与技术服务：4000 元",
      "AI API 调用与服务器部署：3000 元",
      "用户调研、UI 素材、校园推广：6000 元",
      "答辩展示、资料购置及其他：2000 元"
    ],
    layout: "账单式预算页，左侧总额，右侧条目按金额排序，体现经费使用合理性。",
    image: "配图建议：预算条形图或资金流向图，避免使用财务表格截图。",
    notes: "答辩时强调经费与项目目标对应：开发、AI 调用、调研、推广、展示都有明确用途，且总额适合本科生创业训练的低成本验证。"
  },
  {
    no: 11,
    layoutId: "S13",
    animate: "three-forces",
    theme: "light",
    kicker: "TEAM · FEASIBILITY",
    title: "团队分工明确，学校资源支撑充分",
    subtitle: "三人小团队采用“负责人统筹 + 调研数据 + 竞品市场”的分工方式，适合轻量产品迭代。",
    core: [
      "张少毅：产品定位、原型开发、商业模式、答辩统筹",
      "周奕轩：问卷设计、访谈执行、数据整理、需求分析",
      "陈佳颖：竞品分析、市场资料、视觉展示、推广材料",
      "学校资源：实训中心、融媒体平台、班级社群和课程场景"
    ],
    layout: "三力模型页：产品开发力、用户验证力、市场表达力，底部补充风险控制。",
    image: "配图建议：团队分工矩阵或三角协作图，可辅以学校实践平台照片。",
    notes: "突出小团队的边界感：我们不做复杂底层算法，而是做可执行的产品原型和创业训练过程；风险主要来自 API 成本、持续使用和数据隐私，都会通过低成本部署、校内小样本试用和本地存储策略控制。"
  },
  {
    no: 12,
    layoutId: "S10",
    animate: "split-statement",
    theme: "split",
    kicker: "CLOSING · REQUEST FOR APPROVAL",
    title: "让 AI 帮学生把知识留下来",
    subtitle: "预期形成可演示产品原型、用户调研报告、竞品分析报告、创业计划书、模拟运营报告、答辩 PPT 与演示视频。",
    core: [
      "AI+教育方向明确：聚焦高校学生自主学习能力提升",
      "已有原型基础：GitHub 项目和前端网页可持续迭代",
      "创业训练可行：用户可触达、路径可验证、成果可交付"
    ],
    layout: "左右分屏收束页，左侧宣言，右侧列出 3 条立项理由和预期成果。",
    image: "配图建议：可在结尾放知识节点逐步连接成图谱的简洁动效或静态网络图。",
    notes: "结尾回到立项请求：项目具备明确问题、已有基础、可验证路径和创业训练价值。用一句话收束：希望通过本项目把 AI 从“生成答案”推进到“帮助学生形成长期知识资产”。"
  }
];

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function imageText(s) {
  return String(s.image || "").replace(/^配图建议：/, "");
}

function chrome(no, left) {
  return `<div class="chrome-min"><div class="l">${esc(left)}</div><div class="r">DIGEST · ${DATE} · ${String(no).padStart(2, "0")} / ${TOTAL}</div></div>`;
}

function htmlCards(items) {
  return items.map((item, i) => `
    <div class="sub-card" data-anim="card">
      <div class="sub-nb">${String(i + 1).padStart(2, "0")}</div>
      <h3>${esc(item.split("：")[0])}</h3>
      <p>${esc(item.includes("：") ? item.split("：").slice(1).join("：") : item)}</p>
    </div>`).join("");
}

function regularSlide(s) {
  if (s.no === 1) return coverSlide(s);
  if (s.no === 4) return loopSlide(s);
  if (s.no === 5) return imageSlide(s);
  if (s.no === 6) return compareSlide(s);
  if (s.no === 9) return timelineSlide(s);
  if (s.no === 10) return budgetSlide(s);
  if (s.no === 12) return closingSlide(s);
  return `
<section class="slide ${s.theme === "grey" ? "grey" : ""}" data-layout="${s.layoutId}" data-animate="${s.animate}">
  <div class="canvas-card">
    ${chrome(s.no, s.kicker)}
    <div style="flex:1;padding:0;display:grid;grid-template-rows:auto 1fr auto;gap:3vh">
      <div data-anim="head" style="display:flex;flex-direction:column;gap:1.3vh;max-width:82vw">
        <div class="t-meta">${esc(s.kicker)}</div>
        <h2 class="h-xl-zh" style="font-size:min(5.2vw,9.2vh)">${esc(s.title)}</h2>
        <p class="lead" style="max-width:70ch">${esc(s.subtitle)}</p>
      </div>
      <div class="sub-grid-3-2" style="margin-top:0">
        ${htmlCards((s.no === 2 ? s.core : s.core.concat(["验证指标：使用意愿、功能优先级、持续使用可能性", "答辩重点：突出 AI+教育、原型基础与创业训练过程"])).slice(0, 6))}
      </div>
      <div class="t-meta" style="border-top:1px solid var(--border-subtle);padding-top:1.4vh;color:var(--text-helper)">版式 ${s.layoutId} · 配图建议：${esc(imageText(s))}</div>
    </div>
  </div>
</section>`;
}

function coverSlide(s) {
  return `
<section class="slide accent" data-layout="${s.layoutId}" data-animate="hero">
  <div class="canvas-card">
    <canvas class="ascii-bg" aria-hidden="true"></canvas>
    ${chrome(s.no, s.kicker)}
    <div style="flex:1;padding:0;display:grid;grid-template-rows:auto 1fr auto;gap:2.6vh">
      <div data-anim="kicker" class="t-meta" style="color:rgba(255,255,255,.78);letter-spacing:.22em">${esc(s.kicker)}</div>
      <div data-anim="title" style="align-self:start;display:flex;flex-direction:column;justify-content:center;min-height:48vh">
        <h1 style="font-family:var(--sans),var(--sans-zh);font-weight:200;font-size:min(10vw,17vh);line-height:.94;letter-spacing:-.025em;color:#fff">${esc(s.title)}</h1>
        <p style="font-family:var(--sans),var(--sans-zh);font-size:min(2.4vw,4.2vh);line-height:1.35;color:rgba(255,255,255,.88);font-weight:300;margin-top:2.4vh;max-width:28em">${esc(s.subtitle)}</p>
      </div>
      <div data-anim="bottom" style="display:grid;grid-template-columns:1fr auto;gap:3vw;border-top:1px solid rgba(255,255,255,.24);padding-top:2vh;align-items:end">
        <div class="lead" style="color:rgba(255,255,255,.86);font-weight:300">${esc(s.core.join(" · "))}</div>
        <div class="t-meta" style="color:rgba(255,255,255,.62);text-align:right">Shanghai University of Political Science and Law</div>
      </div>
    </div>
  </div>
</section>`;
}

function loopSlide(s) {
  const steps = ["输入资料", "AI 解析", "复习问题", "知识节点", "长期复习"];
  return `
<section class="slide" data-layout="${s.layoutId}" data-animate="loop-form">
  <div class="canvas-card">
    ${chrome(s.no, s.kicker)}
    <div style="flex:1;display:grid;grid-template-columns:5fr 7fr;gap:4vw;align-items:center">
      <div data-anim="left" style="display:flex;flex-direction:column;gap:2vh">
        <div class="t-meta">${esc(s.kicker)}</div>
        <h2 class="h-xl-zh" style="font-size:min(5.3vw,9.2vh)">${esc(s.title)}</h2>
        <p class="lead">${esc(s.subtitle)}</p>
        <div style="display:flex;flex-direction:column;gap:1.2vh;margin-top:1vh">${s.core.map((item, i) => `<div class="card-fill" style="padding:1.6vh 1.4vw"><div class="t-meta" style="color:var(--accent)">0${i + 1}</div><div style="font-size:max(15px,1.05vw);line-height:1.45">${esc(item)}</div></div>`).join("")}</div>
      </div>
      <div data-anim="diagram" style="position:relative;min-height:54vh;border-left:2px solid var(--accent);padding-left:3vw">
        ${steps.map((step, i) => `<div style="position:absolute;left:${8 + (i % 2) * 42}%;top:${6 + i * 17}%;width:15vw;padding:1.6vh 1vw;border:1px solid var(--border-subtle);background:${i === 1 || i === 3 ? "var(--accent)" : "var(--paper)"};color:${i === 1 || i === 3 ? "var(--accent-on)" : "var(--ink)"}"><div class="t-meta" style="color:inherit;opacity:.72">STEP ${i + 1}</div><strong style="font-weight:500">${esc(step)}</strong></div>`).join("")}
        <svg viewBox="0 0 600 360" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none" aria-hidden="true"><path d="M120 70 C470 40 500 300 160 300 C60 300 60 110 120 70" fill="none" stroke="var(--accent)" stroke-width="2"/></svg>
      </div>
    </div>
  </div>
</section>`;
}

function imageSlide(s) {
  const img = `assets/${s.imageFile}`;
  return `
<section class="slide" data-layout="${s.layoutId}" data-animate="image-hero">
  <div class="canvas-card">
    ${chrome(s.no, s.kicker)}
    <div style="flex:1;display:grid;grid-template-rows:58vh auto;gap:2.4vh">
      <div data-anim="image" data-image-slot="s22-hero-21x9" style="position:relative;border:1px solid var(--border-subtle);overflow:hidden;background:#07101d">
        <img src="${img}" alt="Digest 原型截图" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block">
        <div style="position:absolute;left:2vw;top:2vh;background:rgba(250,250,248,.94);color:var(--ink);padding:2vh 2vw;max-width:42vw">
          <div class="t-meta" style="color:var(--accent)">${esc(s.kicker)}</div>
          <h2 class="h-md" style="margin-top:.8vh">${esc(s.title)}</h2>
        </div>
      </div>
      <div data-anim="kpis" style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.4vw">
        ${s.core.map((item, i) => `<div class="card-fill" style="padding:1.8vh 1.2vw"><div class="t-meta" style="color:var(--accent)">0${i + 1}</div><p style="font-size:max(13px,.95vw);line-height:1.55">${esc(item)}</p></div>`).join("")}
      </div>
    </div>
  </div>
</section>`;
}

function compareSlide(s) {
  return `
<section class="slide grey" data-layout="${s.layoutId}" data-animate="duo-mirror">
  <div class="canvas-card">
    ${chrome(s.no, s.kicker)}
    <div data-anim="head" style="display:flex;flex-direction:column;gap:1.3vh;margin-bottom:4vh">
      <div class="t-meta">${esc(s.kicker)}</div>
      <h2 class="h-xl-zh" style="font-size:min(5.2vw,9.2vh)">${esc(s.title)}</h2>
      <p class="lead">${esc(s.subtitle)}</p>
    </div>
    <div class="duo-compare" style="flex:1">
      <div class="col">
        <div class="col-tag"><span class="num">01</span> GENERAL TOOLS</div>
        <div class="col-ttl">一次性回答</div>
        <p class="col-desc">擅长快速生成内容，但学习路径往往停留在单次摘要和问答。</p>
        <ul class="col-list"><li>结果依赖 prompt</li><li>资料和复习记录分散</li><li>缺少知识关系可视化</li></ul>
      </div>
      <div class="vrule"></div>
      <div class="col accent">
        <div class="col-tag"><span class="num">02</span> DIGEST</div>
        <div class="col-ttl">长期知识资产</div>
        <p class="col-desc">把阅读内容拆成节点、问题和关系，服务后续复习与表达。</p>
        <ul class="col-list"><li>结构化摘要与论据整理</li><li>主动回忆问题生成</li><li>知识节点与图谱沉淀</li></ul>
      </div>
    </div>
  </div>
</section>`;
}

function timelineSlide(s) {
  const nodes = [
    ["06-08", "方案设计", "资料查阅、定位、功能优先级"],
    ["09-11", "需求验证", "问卷访谈、竞品分析、校内试用"],
    ["11-12", "中期检查", "根据反馈优化原型"],
    ["12-01", "数据分析", "整理问卷、访谈和试用结果"],
    ["01-04", "成果答辩", "报告、视频、PPT、推广"]
  ];
  return `
<section class="slide" data-layout="${s.layoutId}" data-animate="timeline-walk">
  <div class="canvas-card">
    ${chrome(s.no, s.kicker)}
    <div data-anim="head" style="display:flex;flex-direction:column;gap:1.3vh">
      <div class="t-meta">${esc(s.kicker)}</div>
      <h2 class="h-xl-zh" style="font-size:min(5.2vw,9.2vh)">${esc(s.title)}</h2>
      <p class="lead">${esc(s.subtitle)}</p>
    </div>
    <div class="timeline-h" style="flex:1;margin-top:5vh">
      <div class="tl-row">
        ${nodes.map((n, i) => `<div class="th-node ${i % 2 ? "down" : "up"} ${i === 1 || i === 4 ? "accent" : ""}"><div class="dot"></div><div class="label"><div class="yr">2026.${esc(n[0])}</div><div class="name">${esc(n[1])}</div><div class="desc">${esc(n[2])}</div></div></div>`).join("")}
      </div>
    </div>
    <div class="t-meta" style="border-top:1px solid var(--border-subtle);padding-top:1.4vh;color:var(--text-helper)">输出：产品原型 · 用户调研报告 · 竞品分析报告 · 创业报告 · 演示视频</div>
  </div>
</section>`;
}

function budgetSlide(s) {
  const rows = [
    ["产品开发与技术服务", 4000],
    ["AI API 调用与服务器部署", 3000],
    ["用户调研与访谈", 2000],
    ["UI 设计与视觉素材", 2000],
    ["产品测试与校园推广", 2000],
    ["答辩展示与视频制作", 1500],
    ["资料购置与其他支出", 500]
  ];
  return `
<section class="slide grey" data-layout="${s.layoutId}" data-animate="stacked-ledger">
  <div class="canvas-card">
    ${chrome(s.no, s.kicker)}
    <div style="flex:1;display:grid;grid-template-columns:4fr 8fr;gap:4vw;align-items:center">
      <div data-anim="left">
        <div class="t-meta">${esc(s.kicker)}</div>
        <div style="font-family:var(--mono);font-size:min(7.6vw,13vh);line-height:.9;color:var(--accent);margin:3vh 0">15,000</div>
        <h2 class="h-md">${esc(s.title)}</h2>
        <p class="lead" style="margin-top:1.6vh">${esc(s.subtitle)}</p>
      </div>
      <div data-anim="ledger" style="display:flex;flex-direction:column;gap:1.1vh">
        ${rows.map(([name, amount]) => `<div style="display:grid;grid-template-columns:2.3fr 1fr 3fr;gap:1vw;align-items:center;padding:1.3vh 0;border-top:1px solid var(--border-subtle)"><div>${esc(name)}</div><div class="t-meta" style="color:var(--accent);text-align:right">${amount} 元</div><div style="height:10px;background:var(--grey-2)"><div style="height:100%;width:${Math.round(amount / 4000 * 100)}%;background:var(--accent)"></div></div></div>`).join("")}
      </div>
    </div>
  </div>
</section>`;
}

function closingSlide(s) {
  return `
<section class="slide split" data-layout="${s.layoutId}" data-animate="split-statement">
  <div class="canvas-card">
    <div class="split-half">
      <div class="half b-accent" style="padding:5.6vh 3.6vw 4.4vh;justify-content:space-between;position:relative;overflow:hidden">
        <canvas class="ascii-bg" aria-hidden="true"></canvas>
        <div class="chrome-min" style="margin-bottom:0;position:relative;z-index:1"><div class="l">12 / 12</div><div class="r">CLOSING</div></div>
        <div data-anim="manifesto" style="position:relative;z-index:1">
          <div class="t-meta" style="color:rgba(255,255,255,.78);letter-spacing:.22em;margin-bottom:2vh">${esc(s.kicker)}</div>
          <h2 style="font-family:var(--sans),var(--sans-zh);font-size:min(7.4vw,13vh);line-height:.96;letter-spacing:-.025em;font-weight:200;color:#fff">让 AI 帮学生<br/>把知识<span style="font-style:italic;font-weight:300">留下来</span></h2>
          <p style="font-size:max(14px,1.05vw);line-height:1.6;color:rgba(255,255,255,.82);font-weight:300;max-width:36ch;margin-top:2vh">${esc(s.subtitle)}</p>
        </div>
        <div class="t-meta" style="color:rgba(255,255,255,.62);position:relative;z-index:1;border-top:1px solid rgba(255,255,255,.24);padding-top:2vh">REQUEST FOR APPROVAL</div>
      </div>
      <div class="half" style="padding:5.6vh 3.6vw 4.4vh;justify-content:space-between">
        <div class="chrome-min"><div class="l">TAKEAWAYS</div><div class="r">03 REASONS</div></div>
        <div data-anim="rules" style="display:flex;flex-direction:column;gap:0">
          ${s.core.map((item, i) => `<div style="display:grid;grid-template-columns:auto 1fr;gap:2vw;align-items:start;padding:2.7vh 0;border-top:1px solid var(--border-subtle);${i === 2 ? "border-bottom:2px solid var(--accent)" : ""}"><div style="font-family:var(--sans);font-weight:200;font-size:min(4.4vw,7.8vh);line-height:.9;color:${i === 2 ? "var(--accent)" : "var(--text-primary)"}">0${i + 1}</div><div><h3 style="font-weight:400;font-size:max(18px,1.75vw);line-height:1.2;letter-spacing:-.015em;color:${i === 2 ? "var(--accent)" : "var(--text-primary)"}">${esc(item.split("：")[0])}</h3><p style="font-size:max(12px,.92vw);line-height:1.6;color:var(--text-secondary);font-weight:300;margin-top:.8vh">${esc(item.includes("：") ? item.split("：").slice(1).join("：") : item)}</p></div></div>`).join("")}
        </div>
        <div class="t-meta" style="color:var(--text-helper);text-align:right">END · THANK YOU</div>
      </div>
    </div>
  </div>
</section>`;
}

function buildHtml() {
  let template = fs.readFileSync(TEMPLATE, "utf8");
  template = template.replace("[必填] 替换为 PPT 标题 · Deck Title", TITLE);
  const css = `
  /* Digest defense additions */
  .card-fill{background:var(--paper);border:1px solid var(--border-subtle)}
  .slide.grey .card-fill{background:#fff}
  .sub-card{opacity:1!important;transform:none!important}
  .sub-card h3{font-size:max(15px,1.2vw);font-weight:500;margin:.8vh 0;line-height:1.3}
  .sub-card p{font-size:max(11px,.88vw);line-height:1.55;color:var(--text-secondary);font-weight:300}
  .sub-nb{font-family:var(--mono);font-size:max(10px,.76vw);color:var(--accent);letter-spacing:.08em}
  `;
  template = template.replace("</style>", `${css}\n</style>`);
  const htmlSlides = slides.map(regularSlide).join("\n");
  const start = template.indexOf("<!-- SLIDES_HERE");
  const endMarker = "\n</div>\n\n<div id=\"nav\"></div>";
  const end = template.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("Could not locate SLIDES_HERE replacement range.");
  const html = template.slice(0, start) + htmlSlides + template.slice(end);
  fs.writeFileSync(path.join(OUT, "沉淀Digest_创业训练答辩_guizang.html"), html, "utf8");
}

function buildMarkdown() {
  const body = [
    `# ${TITLE}`,
    "",
    "风格：正式、清晰、瑞士信息型视觉；适合高校立项答辩。",
    "",
    ...slides.flatMap((s) => [
      `## ${String(s.no).padStart(2, "0")}｜${s.title}`,
      "",
      `**标题**：${s.title}`,
      "",
      `**核心文案**：${s.subtitle}`,
      "",
      ...s.core.map((c) => `- ${c}`),
      "",
      `**版式建议**：${s.layout}`,
      "",
      `**配图建议**：${imageText(s)}`,
      "",
      `**演讲备注**：${s.notes}`,
      ""
    ])
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "沉淀Digest_创业训练答辩_12页脚本.md"), body, "utf8");
}

const C = {
  paper: "FAFAF8",
  ink: "0A0A0A",
  grey1: "F0F0EE",
  grey2: "D4D4D2",
  grey3: "737373",
  accent: "002FA7",
  white: "FFFFFF"
};

function addFooter(slide, no, dark = false) {
  slide.addShape(PptxGenJS.ShapeType.line, { x: 0.55, y: 7.05, w: 12.25, h: 0, line: { color: dark ? "89A0E8" : C.grey2, width: 0.7 } });
  slide.addText(`DIGEST · ${DATE}`, { x: 0.55, y: 7.12, w: 3.2, h: 0.18, fontFace: "Consolas", fontSize: 6.5, color: dark ? "DCE4FF" : C.grey3, charSpace: 1 });
  slide.addText(`${String(no).padStart(2, "0")} / ${TOTAL}`, { x: 11.65, y: 7.12, w: 1.15, h: 0.18, align: "right", fontFace: "Consolas", fontSize: 6.5, color: dark ? "DCE4FF" : C.grey3, charSpace: 1 });
}

function addKicker(slide, s, color = C.grey3) {
  slide.addText(s.kicker, { x: 0.62, y: 0.38, w: 8.6, h: 0.22, fontFace: "Consolas", fontSize: 7.5, color, bold: true, charSpace: 1.2 });
}

function addTitle(slide, title, subtitle, y = 0.82) {
  slide.addText(title, { x: 0.6, y, w: 8.5, h: 0.78, fontFace: "Microsoft YaHei", fontSize: 29, bold: false, color: C.ink, fit: "shrink" });
  slide.addText(subtitle, { x: 0.62, y: y + 0.88, w: 8.1, h: 0.52, fontFace: "Microsoft YaHei", fontSize: 10.5, color: C.grey3, breakLine: false, fit: "shrink", valign: "mid" });
}

function noteText(s) {
  return [
    `标题：${s.title}`,
    `核心文案：${s.subtitle}`,
    `版式建议：${s.layout}`,
    `配图建议：${imageText(s)}`,
    `演讲备注：${s.notes}`
  ].join("\n\n");
}

function addNotes(slide, s) {
  slide.addNotes(noteText(s));
}

function addCoreCards(slide, items, opts = {}) {
  const x = opts.x ?? 0.62;
  const y = opts.y ?? 2.12;
  const w = opts.w ?? 12.1;
  const cols = opts.cols ?? 2;
  const gap = opts.gap ?? 0.18;
  const cardW = (w - gap * (cols - 1)) / cols;
  const cardH = opts.cardH ?? 1.08;
  items.forEach((item, i) => {
    const cx = x + (i % cols) * (cardW + gap);
    const cy = y + Math.floor(i / cols) * (cardH + 0.2);
    const accent = opts.accentIndex === i;
    slide.addShape(PptxGenJS.ShapeType.rect, { x: cx, y: cy, w: cardW, h: cardH, fill: { color: accent ? C.accent : (opts.fill || C.white) }, line: { color: accent ? C.accent : C.grey2, width: 0.7 } });
    slide.addText(String(i + 1).padStart(2, "0"), { x: cx + 0.15, y: cy + 0.12, w: 0.45, h: 0.18, fontFace: "Consolas", fontSize: 7.5, color: accent ? C.white : C.accent, bold: true });
    slide.addText(item, { x: cx + 0.72, y: cy + 0.16, w: cardW - 0.88, h: cardH - 0.26, fontFace: "Microsoft YaHei", fontSize: opts.fontSize ?? 11, color: accent ? C.white : C.ink, breakLine: false, fit: "shrink", valign: "mid" });
  });
}

function buildPptx() {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Codex";
  pptx.company = "Shanghai University of Political Science and Law";
  pptx.subject = TITLE;
  pptx.title = TITLE;
  pptx.lang = "zh-CN";
  pptx.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei",
    lang: "zh-CN"
  };

  slides.forEach((s) => {
    const slide = pptx.addSlide();
    if (s.no === 1) {
      slide.background = { color: C.accent };
      slide.addText("STARTUP TRAINING · AI + EDUCATION", { x: 0.68, y: 0.45, w: 6.6, h: 0.25, fontFace: "Consolas", fontSize: 8, color: "DCE4FF", bold: true, charSpace: 1.4 });
      slide.addText("沉淀 Digest", { x: 0.68, y: 1.55, w: 8.8, h: 1.2, fontFace: "Microsoft YaHei", fontSize: 46, color: C.white, bold: false, fit: "shrink" });
      slide.addText(s.subtitle, { x: 0.74, y: 2.9, w: 8.2, h: 0.45, fontFace: "Microsoft YaHei", fontSize: 16, color: "EDF2FF", fit: "shrink" });
      slide.addShape(PptxGenJS.ShapeType.line, { x: 0.72, y: 5.85, w: 11.8, h: 0, line: { color: "8AA0F3", width: 0.7 } });
      slide.addText(s.core.join("  ·  "), { x: 0.72, y: 6.05, w: 11.4, h: 0.34, fontFace: "Microsoft YaHei", fontSize: 10.5, color: "EDF2FF", fit: "shrink" });
      addFooter(slide, s.no, true);
      addNotes(slide, s);
      return;
    }

    if (s.theme === "grey") slide.background = { color: C.grey1 };
    addKicker(slide, s);
    addTitle(slide, s.title, s.subtitle);

    if (s.no === 4) {
      const steps = ["输入资料", "AI 解析", "结构化摘要", "复习问题", "知识节点", "图谱复习"];
      steps.forEach((step, i) => {
        const x = 0.8 + i * 2.02;
        const y = 3.28 + (i % 2 ? 0.55 : 0);
        slide.addShape(PptxGenJS.ShapeType.rect, { x, y, w: 1.55, h: 0.68, fill: { color: i === 1 || i === 4 ? C.accent : C.white }, line: { color: i === 1 || i === 4 ? C.accent : C.grey2, width: 0.7 } });
        slide.addText(step, { x: x + 0.12, y: y + 0.21, w: 1.32, h: 0.18, align: "center", fontFace: "Microsoft YaHei", fontSize: 10.5, bold: true, color: i === 1 || i === 4 ? C.white : C.ink, fit: "shrink" });
        if (i < steps.length - 1) slide.addShape(PptxGenJS.ShapeType.line, { x: x + 1.55, y: y + 0.34, w: 0.48, h: (i % 2 ? -0.55 : 0.55), line: { color: C.accent, width: 1.2, beginArrowType: "none", endArrowType: "triangle" } });
      });
      addCoreCards(slide, s.core, { x: 0.72, y: 5.2, w: 11.9, cols: 3, cardH: 0.82, fontSize: 9.5 });
    } else if (s.no === 5) {
      const img = path.join(ASSETS, s.imageFile);
      if (fs.existsSync(img)) slide.addImage({ path: img, x: 0.72, y: 2.05, w: 7.3, h: 4.2 });
      addCoreCards(slide, s.core, { x: 8.25, y: 2.08, w: 4.35, cols: 1, cardH: 1.12, fontSize: 10.4, accentIndex: 0 });
    } else if (s.no === 6) {
      slide.addShape(PptxGenJS.ShapeType.line, { x: 6.65, y: 2.15, w: 0, h: 4.45, line: { color: C.grey2, width: 0.8 } });
      const left = ["一次性摘要", "结果依赖 prompt", "资料与复习记录分散"];
      const right = ["结构化输出", "主动回忆问题", "知识节点与图谱沉淀"];
      slide.addText("通用 AI / 传统笔记", { x: 0.85, y: 2.18, w: 4.8, h: 0.45, fontFace: "Microsoft YaHei", fontSize: 20, color: C.ink });
      slide.addText("Digest", { x: 7.15, y: 2.18, w: 3.8, h: 0.45, fontFace: "Microsoft YaHei", fontSize: 20, color: C.accent });
      addCoreCards(slide, left, { x: 0.85, y: 3.05, w: 5.2, cols: 1, cardH: 0.78, fontSize: 10 });
      addCoreCards(slide, right, { x: 7.15, y: 3.05, w: 5.2, cols: 1, cardH: 0.78, fontSize: 10, accentIndex: 0 });
    } else if (s.no === 9) {
      const nodes = ["资料查阅", "需求验证", "原型优化", "数据分析", "结项答辩"];
      slide.addShape(PptxGenJS.ShapeType.line, { x: 1.1, y: 3.95, w: 11.1, h: 0, line: { color: C.grey2, width: 1 } });
      nodes.forEach((n, i) => {
        const x = 1.1 + i * 2.77;
        slide.addShape(PptxGenJS.ShapeType.rect, { x: x - 0.05, y: 3.86, w: 0.18, h: 0.18, fill: { color: i === 1 || i === 4 ? C.accent : C.ink }, line: { color: i === 1 || i === 4 ? C.accent : C.ink } });
        slide.addText(n, { x: x - 0.55, y: i % 2 ? 4.25 : 3.1, w: 1.4, h: 0.3, align: "center", fontFace: "Microsoft YaHei", fontSize: 11, color: i === 1 || i === 4 ? C.accent : C.ink, bold: true });
        slide.addText(["2026.06-08", "2026.09-11", "2026.11-12", "2026.12-01", "2027.01-04"][i], { x: x - 0.65, y: i % 2 ? 4.58 : 2.78, w: 1.6, h: 0.2, align: "center", fontFace: "Consolas", fontSize: 7.2, color: C.grey3 });
      });
      addCoreCards(slide, s.core, { x: 0.72, y: 5.4, w: 11.9, cols: 2, cardH: 0.55, fontSize: 8.8 });
    } else if (s.no === 10) {
      slide.addText("15,000", { x: 0.75, y: 2.15, w: 4.1, h: 0.8, fontFace: "Consolas", fontSize: 42, bold: true, color: C.accent });
      slide.addText("元项目资助经费", { x: 0.82, y: 2.95, w: 3.2, h: 0.26, fontFace: "Microsoft YaHei", fontSize: 10.5, color: C.grey3 });
      const rows = [["开发", 4000], ["API/部署", 3000], ["调研访谈", 2000], ["UI/素材", 2000], ["测试推广", 2000], ["展示视频", 1500], ["资料其他", 500]];
      rows.forEach(([name, amount], i) => {
        const y = 2.15 + i * 0.58;
        slide.addText(name, { x: 5.1, y, w: 1.7, h: 0.2, fontFace: "Microsoft YaHei", fontSize: 9.2, color: C.ink });
        slide.addShape(PptxGenJS.ShapeType.rect, { x: 6.9, y: y + 0.04, w: 4.2, h: 0.12, fill: { color: C.grey2 }, line: { color: C.grey2 } });
        slide.addShape(PptxGenJS.ShapeType.rect, { x: 6.9, y: y + 0.04, w: 4.2 * amount / 4000, h: 0.12, fill: { color: C.accent }, line: { color: C.accent } });
        slide.addText(`${amount} 元`, { x: 11.25, y, w: 0.9, h: 0.2, align: "right", fontFace: "Consolas", fontSize: 8.5, color: C.accent });
      });
    } else if (s.no === 12) {
      slide.background = { color: C.accent };
      slide.addText("让 AI 帮学生\n把知识留下来", { x: 0.75, y: 1.25, w: 5.25, h: 1.9, fontFace: "Microsoft YaHei", fontSize: 34, color: C.white, breakLine: false, fit: "shrink" });
      slide.addText(s.subtitle, { x: 0.82, y: 4.75, w: 5.2, h: 0.72, fontFace: "Microsoft YaHei", fontSize: 10.5, color: "EDF2FF", fit: "shrink" });
      s.core.forEach((item, i) => {
        const y = 1.35 + i * 1.25;
        slide.addShape(PptxGenJS.ShapeType.rect, { x: 6.75, y, w: 5.55, h: 0.95, fill: { color: C.white, transparency: 0 }, line: { color: C.white } });
        slide.addText(`0${i + 1}`, { x: 6.98, y: y + 0.22, w: 0.45, h: 0.2, fontFace: "Consolas", fontSize: 8.5, color: C.accent, bold: true });
        slide.addText(item, { x: 7.55, y: y + 0.18, w: 4.35, h: 0.34, fontFace: "Microsoft YaHei", fontSize: 12.2, color: C.ink, bold: true, fit: "shrink" });
      });
      addFooter(slide, s.no, true);
      addNotes(slide, s);
      return;
    } else {
      const cards = s.no === 2 ? s.core : s.core.concat(s.no === 11 ? [] : ["创业训练重点：需求验证、市场分析、模拟运营"]);
      addCoreCards(slide, cards.slice(0, 6), { x: 0.72, y: 2.35, w: 11.8, cols: s.no === 8 ? 4 : 2, cardH: s.no === 8 ? 1.65 : 1.02, fontSize: s.no === 8 ? 9.2 : 10.2, accentIndex: s.no === 8 ? 1 : undefined });
    }

    addFooter(slide, s.no);
    addNotes(slide, s);
  });

  return pptx.writeFile({ fileName: path.join(OUT, "沉淀Digest_创业训练立项答辩.pptx") });
}

(async function main() {
  fs.mkdirSync(ASSETS, { recursive: true });
  buildHtml();
  buildMarkdown();
  await buildPptx();
  console.log(JSON.stringify({
    html: path.join(OUT, "沉淀Digest_创业训练答辩_guizang.html"),
    pptx: path.join(OUT, "沉淀Digest_创业训练立项答辩.pptx"),
    script: path.join(OUT, "沉淀Digest_创业训练答辩_12页脚本.md")
  }, null, 2));
})();
