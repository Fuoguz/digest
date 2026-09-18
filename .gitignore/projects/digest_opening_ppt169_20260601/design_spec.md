# Digest Opening Defense - Design Spec

> Human-readable design narrative for the PPT Master pipeline. Machine-readable execution contract: `spec_lock.md`.

## I. Project Information

| Item | Value |
| ---- | ----- |
| **Project Name** | 沉淀 Digest |
| **Canvas Format** | PPT 16:9 (1280x720) |
| **Page Count** | 10 slides |
| **Design Style** | A) General Versatile + dark tech education SaaS pitch deck |
| **Target Audience** | 上海政法学院大学生创新创业训练计划开题答辩评委 |
| **Use Case** | 5 分钟项目开题答辩 + 5 分钟问答 |
| **Created Date** | 2026-06-01 |

---

## II. Canvas Specification

| Property | Value |
| -------- | ----- |
| **Format** | PPT 16:9 |
| **Dimensions** | 1280x720 |
| **viewBox** | `0 0 1280 720` |
| **Margins** | 56px left/right, 44px top, 32px bottom |
| **Content Area** | 1168x620 |

---

## III. Visual Theme

### Theme Style

- **Style**: 深蓝/墨黑底，青绿色与浅蓝色高亮，轻量 SaaS 产品路演感。
- **Theme**: Dark theme
- **Tone**: 清爽、克制、科技感、教育产品感；避免花哨卡通和商业硬广。

### Color Scheme

| Role | HEX | Purpose |
| ---- | --- | ------- |
| **Background** | `#08111F` | 主背景 |
| **Dim background** | `#0C1A2D` | 层次背景 |
| **Secondary bg** | `#101B2E` | 面板背景 |
| **Panel soft** | `#13243A` | 次级面板 |
| **Panel highlight** | `#17314B` | 高亮卡片 |
| **Primary** | `#3BA7FF` | 重点标题、流程主线 |
| **Accent** | `#20E3B2` | 关键价值、高亮节点 |
| **Secondary accent** | `#7C5CFF` | AI / 图谱辅助高亮 |
| **Warning** | `#FFC857` | 预算/提醒 |
| **Danger** | `#FF5A7A` | 痛点/焦虑 |
| **Body text** | `#F4F8FF` | 主文字 |
| **Secondary text** | `#A9B8CD` | 正文说明 |
| **Tertiary text** | `#6D7E96` | 页脚、标注 |
| **Border/divider** | `#243A55` | 线条、边框 |
| **Line** | `#31506F` | 图谱连线 |
| **White** | `#FFFFFF` | 局部反白 |
| **Shadow** | `#000000` | 低透明阴影 |

### Gradient Scheme

Only subtle SVG gradients are used for cover glow, section bands, and progress tracks. Gradients must use colors above with stop-opacity, not rgba.

---

## IV. Typography System

### Font Plan

**Typography direction**: CJK-first modern sans, product deck feel.

| Role | Chinese | English | Fallback tail |
| ---- | ------- | ------- | ------------- |
| **Title** | Microsoft YaHei | Arial | sans-serif |
| **Body** | Microsoft YaHei | Arial | sans-serif |
| **Emphasis** | Microsoft YaHei | Arial | sans-serif |
| **Code** | - | Consolas, Courier New | monospace |

**Per-role font stacks**

- Title: `Microsoft YaHei, Arial, sans-serif`
- Body: `Microsoft YaHei, Arial, sans-serif`
- Emphasis: `Microsoft YaHei, Arial, sans-serif`
- Code: `Consolas, Courier New, monospace`

### Font Size Hierarchy

**Baseline**: Body font size = 20px

| Purpose | Size | Weight |
| ------- | ---- | ------ |
| Cover title | 76px | Bold |
| Page title | 34px | Bold |
| Subtitle | 24px | SemiBold |
| Body content | 20px | Regular |
| Annotation / caption | 14px | Regular |
| Footer | 12px | Regular |

---

## V. Layout Principles

### Page Structure

- **Header area**: 44-110px; page title + section cue.
- **Content area**: 120-650px; diagrams, tables, workflows and product-style panels.
- **Footer area**: 660-700px; slide number and compact identity line.

### Layout Pattern Library

| Pattern | Usage |
| ------- | ----- |
| Full-bleed native SVG network | Cover and closing, implying AI knowledge graph |
| Asymmetric split | Positioning and technology architecture |
| Three-stage flow | Daily input, daily digest, final exam output |
| Closed loop | Product functions from input to review |
| Comparison table | Competitors and positioning |
| Budget donut + timeline | Funding plan and yearly implementation |
| Vertical roadmap | Future planning |

### Spacing Specification

| Element | Current Project |
| ------- | --------------- |
| Safe margin | 56px |
| Card gap | 18-28px |
| Card padding | 18-26px |
| Card border radius | 8-14px |
| Icon-text gap | 10-14px |

---

## VI. Icon Usage Specification

### Source

- **Built-in icon library**: `chunk-filled`
- **Usage method**: SVG placeholder `<use data-icon="chunk-filled/icon-name" .../>`

### Recommended Icon List

| Purpose | Icon Path | Page |
| ------- | --------- | ---- |
| PPT / file | `chunk-filled/file` | P02, P04 |
| screenshots / materials | `chunk-filled/files` | P02, P05 |
| classroom audio | `chunk-filled/microphone` | P02, P04 |
| learning video | `chunk-filled/video` | P02, P04 |
| webpages | `chunk-filled/map` | P02 |
| AI processing | `chunk-filled/wand-with-sparkles` | P05, P07 |
| knowledge graph | `chunk-filled/share-nodes` | P01, P05 |
| course library | `chunk-filled/book-open` | P03, P04 |
| database | `chunk-filled/database` | P07 |
| review time | `chunk-filled/clock` | P08 |
| users | `chunk-filled/users` | P09, P10 |
| goal | `chunk-filled/target` | P10 |
| roadmap | `chunk-filled/route` | P09 |
| budget chart | `chunk-filled/chart-pie` | P09 |
| question generation | `chunk-filled/circle-question` | P05 |
| calendar | `chunk-filled/calendar` | P09 |
| refresh loop | `chunk-filled/arrows-rotate-clockwise` | P05 |
| product sparkle | `chunk-filled/sparkles` | P01, P10 |

---

## VII. Visualization Reference List

Catalog read: 71 templates

| Page | Template | Path | Summary-quote (verbatim from `charts_index.json`) | Usage |
| ---- | -------- | ---- | ------------------------------------------------- | ----- |
| P04 | process_flow | `templates/charts/process_flow.svg` | "Pick for 3-8 sequential steps connected by simple arrows 鈥?approval workflows, customer onboarding, request handling, lifecycle stages. Skip if cyclical (use circular_stages) or stages produce named outputs (use pipeline_with_stages)." | 三个学习场景的输入-沉淀-输出路径 |
| P06 | comparison_table | `templates/charts/comparison_table.svg` | "Pick for 2-4 plans/products compared across many feature rows (dense matrix). Skip for pricing-tier marketing layout (use comparison_columns)." | 竞品与 Digest 的差异化对比 |
| P07 | layered_architecture | `templates/charts/layered_architecture.svg` | "Pick for 3-4 horizontal architecture layers (presentation/service/data), 2-4 module cards per layer, each card = title + 1-line description (description required, even if source brief). Skip if no per-module descriptions (use icon_grid) or no horizontal layering (use module_composition)." | 技术实现路径架构 |
| P09 | donut_chart | `templates/charts/donut_chart.svg` | "Pick for 3-6 part proportions where a center KPI/total deserves emphasis. Skip if no center value to feature (use pie_chart)." | 15000 元预算分配 |
| P10 | roadmap_vertical | `templates/charts/roadmap_vertical.svg` | "Pick for 4-8 milestones on a vertical timeline with status indicators. Skip for horizontal time emphasis (use timeline) or tasks with durations (use gantt_chart)." | 三阶段未来规划 |

**Runners-up considered**

- `numbered_steps` | rejected for P04: 场景页强调资料从输入到成果的流动，箭头流程比单纯编号步骤更合适。
- `icon_grid` | rejected for P05: 功能页不是平行功能罗列，而是从输入到复习的闭环。
- `comparison_columns` | rejected for P06: 竞品页需要按“优势/不足/定位”多维对比，表格比营销列卡更清楚。

---

## VIII. Image Resource List

No external raster images are required. All visual assets are native SVG: knowledge graph nodes, flow diagrams, product cards, budget donut, and roadmaps. This keeps the deck editable and avoids attribution risk.

---

## IX. Content Outline

### Slide 01 - Cover

- **Layout**: Full-bleed dark background + abstract native knowledge graph.
- **Title**: 沉淀 Digest
- **Content**: subtitle, slogan, defense info, project owner information.
- **Visualization**: native network diagram.

### Slide 02 - Problem

- **Layout**: Fragmented materials on left, final-review anxiety on right, connected by a breaking path.
- **Title**: 资料越来越多，知识却越来越散
- **Content**: PPT 截图、课堂录音、论文文献、网页文章、B 站课程视频、项目调研资料；现实落点是期末重新整理。

### Slide 03 - Positioning

- **Layout**: Two-column contrast.
- **Title**: Digest 不是聊天 AI，而是学生的课程学习沉淀系统
- **Content**: 通用 AI = 问一次答一次；Digest = 学一学期、沉淀一学期、期末真正用得上。

### Slide 04 - Core Scenarios

- **Layout**: Three-stage process flow.
- **Title**: 围绕大学生真实学习流程设计
- **Content**: 日常上课、课后整理、期末复习。
- **Visualization**: process_flow.

### Slide 05 - Core Functions

- **Layout**: Closed-loop hexagon/circle module diagram.
- **Title**: 从“资料输入”到“知识资产”
- **Content**: 多源输入、AI 结构化摘要、复习问题、知识节点、知识图谱、期末复习包。

### Slide 06 - Differentiation

- **Layout**: Dark comparison table.
- **Title**: 不与大模型比能力，而是嵌入学生学习流程
- **Content**: ChatGPT/Kimi/豆包、Notion AI/Obsidian、飞书妙记/网盘 AI、Digest。
- **Visualization**: comparison_table.

### Slide 07 - Technology Path

- **Layout**: Layered architecture.
- **Title**: 成熟 AI 能力 + 轻量化产品开发
- **Content**: 前端网页、AI API、知识节点库、图谱与复习包、OCR/转写/视频解析拓展。
- **Visualization**: layered_architecture.

### Slide 08 - Business Model

- **Layout**: Stair-step monetization ladder.
- **Title**: 学生不是为 AI 总结付费，而是为节省期末复习时间付费
- **Content**: 免费入口、学期卡、高阶功能、课程复习包、音视频处理额度、团队项目服务。

### Slide 09 - Budget and Plan

- **Layout**: Budget donut on left + implementation timeline on right.
- **Title**: 15000 元经费，聚焦原型开发、用户验证与校内试用
- **Content**: 预算七项，2026.6-2027.4 实施计划。
- **Visualization**: donut_chart + horizontal timeline.

### Slide 10 - Outcomes and Future

- **Layout**: Outcomes list + three-stage roadmap + closing quote.
- **Title**: 从大创原型走向真实可用的校园 AI 学习产品
- **Content**: 预期成果、三阶段规划、结尾金句和感谢语。
- **Visualization**: roadmap_vertical.

---

## X. Speaker Notes Requirements

- **Total duration**: around 5 minutes, 25-35 seconds per slide.
- **Notes style**: concise Chinese defense narration; no bracketed stage markers.
- **Files**: `notes/total.md` split into per-slide note files by `total_md_split.py`.

---

## XI. Technical Constraints Reminder

1. SVG viewBox must be `0 0 1280 720`.
2. Use inline attributes only; no `<style>`, no `class`, no `<foreignObject>`.
3. Use raw Chinese text; XML reserved characters must be escaped.
4. Use HEX colors and `fill-opacity` / `stop-opacity`; no rgba.
5. Use top-level semantic `<g id="...">` groups for PPT editability and animation.
6. Use only approved icons from `chunk-filled`.
