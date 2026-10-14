# workbuddy.md — 使用腾讯 WorkBuddy 开发的对话记录

本文件记录「happytime 麦乐记（happytime-mcd-skill）」使用腾讯 WorkBuddy（https://www.workbuddy.cn/）开发的关键对话上下文，用于核验 WorkBuddy 联动活动奖励条件。开发时间：2026-10-12。

---

## 对话 1：明确参赛方向

**用户：**
> 帮我根据这个网址 https://happytime-jileji.app.workbuddy.host/index4.html，把它改成 skill，去参加麦当劳的程序员节。（附：WorkBuddy x 麦当劳程序员节 brief.docx）

**WorkBuddy：**
读取 brief 并抓取赛事官方仓库（github.com/M-China/mcd-developer-innovation-challenge），提炼参赛要求：

- 基于麦当劳 MCP 能力开发创新 Skill，解决现实问题；
- 作品开源发布至 GitHub 公开仓库，仓库必须包含：README.md、CONTEST_DECLARATION.md（官方原文不可改）、MCP_INTEGRATION.md、源代码，参加 WorkBuddy 专项奖励另需 workbuddy.md；
- 通过活动仓库 Issue 报名（格式：项目名称＋项目地址＋项目简介）；
- 排行榜按公开 Star 数排名，2026-10-26 00:00 定榜。

同时读取了现有在线应用「happytime麦乐记」的源码（`app-part2/src/`），梳理出可迁移的核心资产：

| 应用内资产 | 迁移方向 |
|---|---|
| `lib/ai.ts` 的 Happytime 生成 prompt（短语 time + 2~3 句） | SKILL.md 第 1 步 + references/happytime-copy-guide.md |
| `lib/suggestions.ts` 15 条灵感池（含预设文案） | references/happytime-copy-guide.md |
| `part4/lib/happytime-card.ts` 贺卡 Canvas 合成（绘本背景 + 砖红标题 + 关键词彩色） | templates/happytime-card-template.html + references/visual-guide.md |
| `part4/lib/triptych.ts` + `plugins/qwen-style.mjs` 漫记合成与出图提示词 | templates/postcard-template.html（兜底）+ references/visual-guide.md（出图 prompt） |
| `part2/lib/recommend.ts` 心情选餐 prompt 与兜底策略 | references/mood-meal-guide.md |
| `part2/lib/nutrition.ts` 儿童营养参考值与六项小知识 | references/nutrition-guide.md |
| `part4/assets/` 小薯 5 态、三张绘本背景、纸纹、麦乐记字标、17 个餐品插画、3 款手写字体 | assets/ |
| `tools/fetch-mcd-menu.mjs` MCP 直连同步脚本（含 content[].text 混排 JSON 解析坑） | scripts/fetch-mcd-menu.mjs |

## 对话 2：Skill 形态设计

**WorkBuddy 提出的核心改造思路（已与用户确认执行）：**

Web 应用的价值链是「记录开心事 → AI 文案 → 心情选餐 → 营养卡 → 漫记出片」，改造成 Skill 不是复刻 UI，而是把这条价值链变成 WorkBuddy 对话里的四步流程；同时把 Web 版里写死的 prompt 规则、营养参考值、视觉规范抽成 references（渐进式加载），把明信片 Canvas 合成改为 HTML 模板填充（对话场景无需浏览器 Canvas）。

**关键决策：**

1. MCP 工具升级：Web 版只用了 `list-nutrition-foods` / `query-nearby-stores` / `query-meals` 三个工具；Skill 版按官方最新工具清单补齐 `now-time-info`（落款日期）、`query-meal-detail`、优惠券三件套、`calculate-price` / `create-order`（下单强制二次确认）。
2. 数据真实性红线：推荐对象必须来自 MCP 实时返回，禁止模型凭记忆编造餐品；营养缺失显示「—」。
3. 明信片模板化：`templates/postcard-template.html` 用 `{{TITLE}}` 等占位符，小薯 PNG 白底图用 `mix-blend-mode: multiply` 融入奶油底，无需抠图。
4. 对话节奏：文案生成后不复述等待确认，流程一气呵成；只有下单这种真实交易动作才停下来确认。

## 对话 3：产出与验证

**WorkBuddy 产出：**

```
happytime-mcd-skill/
├── SKILL.md                    # 五步工作流程 + 输出口径 + 快捷用法
├── README.md / MCP_INTEGRATION.md / CONTEST_DECLARATION.md / workbuddy.md
├── references/（mcp-tool-calling / happytime-copy-guide / mood-meal-guide / nutrition-guide / visual-guide）
├── templates/（happytime-card-template.html / postcard-template.html）
├── scripts/fetch-mcd-menu.mjs  # 改造为独立脚本：产出 data/menu-snapshot.json
└── assets/（小薯 5 态、3 张绘本背景、17 个餐品插画、字标、纸纹、3 款字体）
```

**验证方式：** 用样例开心事「今天足球比赛赢了！」走完整流程：文案 → MCP 拉数 → 选餐（庆祝感→堡类+甜品方向）→ 营养卡六项进度 → 贺卡与漫记渲染预览。参见 `example-output/`。

---

## 对话 4：按 v4 同步更新 Skill（2026-10-13）

**用户：**
> 按 v4 重新更新一下 skill

**WorkBuddy：**
重新通读了 v4 在线版的实现增量，把 Skill 从「明信片」升级为 v4 的**双产出物**结构：

| v4 新增 / 变更 | Skill 中的落地 |
|---|---|
| `part4/lib/happytime-card.ts`：16:9 手绘绘本贺卡（背景三选一 + 砖红标题 + 关键词彩色 + 圆角 38 + 中央暖白晕） | 新增 `templates/happytime-card-template.html`，内置同款关键词染色脚本；visual-guide 记录排版常量（标题 58% 宽上限、字距 0.12em、只填充不描边、正文紧跟标题下 44px、≤3 行） |
| `part4/lib/triptych.ts`：漫记改为 AI 一次出整张（两格 + 大图 + 底部纸带题字），Canvas 只补 logo + 日期 | 第 5 步改为「首选图生图一次出整张 → 失败走本地版式兜底」；`templates/postcard-template.html` 重写为 3:4 兜底版式（纸带 BAND_TOP=1120、题字 42→26 逐级降级、logo 底边距卡底 350） |
| `plugins/qwen-style.mjs` 的出图提示词与长度上限（标题 ≤12 字、题字 ≤44 字、场景各 ≤60 字、负向词） | 全文收录进 `references/visual-guide.md`，供图像生成直接复用 |
| `lib/ai.ts` 文案口径（短语 + time / 2~3 句 40~70 字） | 新增 `references/happytime-copy-guide.md`，含 15 条灵感池原表 |
| 三张绘本背景、17 个餐品插画、麦乐记字标、站酷快乐体/马善政字体、涂鸦纸纹 | 全部并入 `assets/`；选餐策略增加「优先挑有本地插画的单品」；README 增加素材与字体授权说明 |

**验证方式：** 重跑两张样例产出（`example-output/happytime-card-sample.html`、`postcard-sample.html`），占位符全部替换、字体与插画相对路径可用，Skill 校验与打包通过。

---

*本对话全程在腾讯 WorkBuddy 中进行（WorkBuddy 是本次赛事官方合作伙伴，https://www.workbuddy.cn/）。*
