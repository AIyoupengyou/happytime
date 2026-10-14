---
name: happytime-mcd-skill
description: happytime 麦乐记（v4 手绘绘本版）—— 把今天的开心事变成一张手绘风「Happytime 贺卡」，配上照片还能出一张「麦乐漫记」三联插画。本技能面向亲子/家庭场景：听取孩子（或大人）今天的一件开心事，生成「短语 time + 2~3 句文案」，调用麦当劳中国 MCP 拉取真实在售菜单与营养数据，按心情推荐最贴合的麦当劳餐品并生成儿童营养卡，最后产出 Happytime 贺卡（16:9 HTML）与麦乐漫记（3:4，图生图一次出整张，失败走本地版式兜底）。当用户想记录开心事、给孩子做一张手绘贺卡或漫记、按心情点麦当劳、查餐品营养、找附近门店时使用本技能。
---

# happytime 麦乐记（v4）

把「今天发生的一件开心事」变成一份能存下来的仪式感：

> 开心事 → Happytime 文案（短语 time + 2~3 句）→ 心情选餐（真实 MCP 数据）→ 儿童营养卡 → **Happytime 贺卡（16:9）** → 有照片再出 **麦乐漫记（3:4 三联）**

核心理念：**不为孩子做「点餐工具」，而为孩子做「把开心留住的小仪式」**。餐品是开心事的注脚，不是目的。

## 工作流程

收到用户的开心事后按下面五步走。手边资源：

- 麦当劳 MCP：连接器 `mcd-mcp`（`https://mcp.mcd.cn`，Streamable HTTP + Bearer Token）。调用约定与解析坑见 `references/mcp-tool-calling.md`。
- 文案口径与灵感池：`references/happytime-copy-guide.md`
- 视觉规范（配色/字体/排版/关键词染色/出图提示词）：`references/visual-guide.md`
- 选餐策略：`references/mood-meal-guide.md`；营养参考：`references/nutrition-guide.md`
- 模板：`templates/happytime-card-template.html`（贺卡）、`templates/postcard-template.html`（漫记兜底版式）
- 素材：`assets/`（小薯吉祥物、三张绘本背景、纸纹、logo 字标、`products/{code}.png` 餐品插画、字体 woff2）

### 第 1 步：听开心事 → 写 Happytime 文案

1. 从用户输入里提取「今天这件开心事」。用户只丢一句话（如「孩子今天跳绳比赛赢了」）就把它当作开心事本身，不要追问打断仪式感；信息严重不足时才用一句话确认，只问一次。
2. 按 `references/happytime-copy-guide.md` 的口径生成：
   - **title**：2~6 个字短语 + ` time`，贴合主题（运动/友谊/学习/创造/勇气/美食…），不重复灵感池已有短语。
   - **copy**：2~3 个短句、合计 40~70 字，用「你」称呼孩子，第一句点画面、第二句夸赞或祝福，第三句可有可无；不说教。
3. 用户说「不知道写什么」时，从灵感池挑 3~4 条短句（每条 ≤11 字）给他选，选中即用（不再生成）。
4. 复述一次文案后继续，不要停下来等确认。

### 第 2 步：拉取麦当劳 MCP 真实数据

1. `now-time-info` — 当前日期（贺卡与漫记落款）。
2. `list-nutrition-foods` — 全量营养表（约 158 条，一次拉全，不要按关键词反复查）。
3. `query-nearby-stores` + `query-meals` — 先拿附近可用门店 `storeCode`（`beType: 1, searchType: 2`），再拉该店在售菜单（`orderType: 1, beType: 1`）得餐品编码/分类/价格/标签。
4. 营养表与在售菜单按「名称归一化」对齐；对不上价签的保留营养、去掉价格。
5. 失败兜底：单工具 429/超时重试一次；仍失败就只用营养表完成推荐，并在营养卡注明「价格以门店为准」。**禁止编造餐品**——推荐对象必须来自 MCP 返回的真实清单。

### 第 3 步：按心情选餐 + 儿童营养卡

1. 按 `references/mood-meal-guide.md`，从真实清单里挑 1 份最贴合气氛的餐品（**优先挑有本地插画 `assets/products/{code}.png` 的单品**），给出 20~35 字推荐理由：用「你」称呼孩子、具体有画面感，结尾带一句相关营养小知识。
2. 营养卡：能量/碳水/蛋白质/脂肪/钠/钙六项，按 7~10 岁每日参考量折算百分比进度条，注明「仅为直觉参考，不构成膳食建议」。
3. 用户说「换一个」→ 排除已推荐项、换分类重挑（可附产品插画）。
4. 用户想找店/券/下单：`query-nearby-stores`、`query-store-coupons` / `available-coupons`、`calculate-price`；**下单（`create-order`）必须先复述门店、餐品、金额并获得明确确认**。

### 第 4 步：出 Happytime 贺卡（16:9）

1. 按 `references/visual-guide.md` 的「Happytime 贺卡」章节挑背景：默认 `assets/bg-flower-frame.jpg`，运动/比赛气氛用 `bg-hill-run.jpg`，自由探索用 `bg-kite-meadow.jpg`。
2. 复制 `templates/happytime-card-template.html` 为工作文件，填 `{{TITLE}}` 与 `{{COPY}}`（关键词染色由模板脚本自动完成，不用手工包 span）。
3. 与模板同目录放 `assets/`，或要单文件交付时把图片/字体改 base64 内嵌。渲染后用预览打开给用户看，提示可截图保存或打印（高清按 ×2 输出 1200×675）。

### 第 5 步：有照片再出「麦乐漫记」（3:4）

用户上传照片时才做这一步；没有照片不要主动索要，贺卡已经是完整交付。

1. 先生成漫记文字：`{"title":"4~10字标题","text":"题字（≤44字）","scenes":{"panel1":"左格场景 ≤60字","panel3":"大图场景 ≤60字"}}`，口径见 `references/happytime-copy-guide.md`。
2. **首选一次出整张**：用图像生成（图生图）能力，把照片 + 提示词交给模型，提示词骨架与长度上限见 `references/visual-guide.md` 的「二、麦乐漫记」。生成后只补两样：右下角 `assets/logo-wordmark.png`（正片叠底）+ 左下角日期 `YYYY.MM.DD · 麦乐漫记`。
3. **兜底**：图像生成不可用时，用 `templates/postcard-template.html`（照片 + 牛皮纸纸带 + 手写题字 + 字标 + 日期）本地出片，填 `{{PHOTO}}`、`{{PHOTO_TITLE}}`、`{{CAPTION}}`、`{{DATE}}`；题字必须完整不截断（长文案逐级缩字号）。
4. 如实告知：模型偶有错字（画面里任何自造文字都可能错），用户觉得不对就直接出一版新的。

## 输出口径

- 全程简体中文；对孩子说话用「你」，句子短、有画面感。
- 营养只做直觉参考，绝不输出「应该吃/不该吃」这类医学判断。
- 餐品价格与供应状态以 MCP 实时返回为准，不凭记忆报价。
- MCP Token 是用户凭证：只在调用时使用，绝不写进产出物、文件或日志。
- 产出物命名带日期：`happytime-卡-YYYY-MM-DD.html` / `麦乐漫记-YYYY-MM-DD.html`。

## 快捷用法

- 只想看营养：「麦乐鸡块热量多少」→ 跳过文案与出图，第 2、3 步直接给数据卡。
- 只想点餐/找店：直接走门店与点餐分支。
- 只要文字卡：第 1 + 第 4 步（不碰 MCP，纯文案出贺卡）。
- 完整仪式（默认）：「记一件开心事」「做个贺卡/漫记」「今天孩子很开心」→ 全流程，有照片就走完第 5 步。
