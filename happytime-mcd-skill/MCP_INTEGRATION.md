# MCP 接入说明（MCP_INTEGRATION）

## 接入的 MCP Server

- **麦当劳中国 MCP Server**
- 接入地址：`https://mcp.mcd.cn`
- 协议：Streamable HTTP（JSON-RPC 2.0）
- 认证：`Authorization: Bearer <MCP_TOKEN>`（在 [open.mcd.cn/mcp](https://open.mcd.cn/mcp) 控制台申请）
- 限流：600 次/分钟/Token（超限 429）
- 官方指南：<https://github.com/M-China/mcd-mcp-server>

## 使用的工具与调用流程

### 主流程（完整仪式）

```
用户讲开心事
   │
   ├─① now-time-info          取当前日期 → 明信片落款
   ├─② list-nutrition-foods   一次性拉全量营养表（能量/蛋白质/脂肪/碳水/钠/钙，约158条）
   ├─③ query-nearby-stores    {beType:1, searchType:2, city, keyword} → 取可用门店 storeCode
   ├─④ query-meals            {storeCode, orderType:1, beType:1} → 在售菜单（分类/编码/价格/标签）
   │
   ├─⑤ 名称归一化对齐 ②与④ → 得到「可推荐清单」（营养全量 ∩ 在售价签）
   ├─⑥ 心情选餐：按气氛映射从清单中选 1 份（优先有本地产品插画的单品）→ 推荐理由 + 营养卡
   ├─⑦ 出 Happytime 贺卡（16:9，templates/happytime-card-template.html 填 {{TITLE}}/{{COPY}}）
   └─⑧ 有照片再出麦乐漫记（3:4）：图生图一次出整张，失败走 templates/postcard-template.html 兜底
```

### 扩展流程（点餐）

```
query-nearby-stores → 列门店
query-store-coupons / available-coupons → 查券（auto-bind-coupons 一键领券）
query-meal-detail → 套餐组成
calculate-price → 金额/配送费/优惠/应付总价
create-order → ⚠️ 必须复述订单内容并获得用户明确确认后才调用
```

## 业务价值

| 能力 | MCP 工具 | 业务价值 |
|---|---|---|
| 心情选餐真实可信 | `query-meals` + `query-nearby-stores` | 推荐对象永远是当下真实在售餐品，不推荐买不到的东西 |
| 营养卡有据可依 | `list-nutrition-foods` | 儿童营养参考全部来自麦当劳官方营养数据 |
| 出片带真实餐品 | `query-meals` 的餐品编码 + 图片 | 产品插画按编码本地化，贺卡/漫记里的餐品与门店在售一致 |
| 省钱顺手完成 | `available-coupons` / `query-store-coupons` / `auto-bind-coupons` | 推荐完顺手查券领券 |
| 闭环点餐 | `calculate-price` / `create-order` | 从「一件开心事」到「下单支付链接」一气呵成 |

## 关键实现细节（踩坑记录）

1. **`content[].text` 混排解析**：MCP 返回的 text 中混有说明文字与原始 JSON，需先定位 `{"success"` 起点、再做大括号配平（正确处理字符串内转义）截取完整 JSON。实现见 `scripts/fetch-mcd-menu.mjs` 的 `pickJson()`。
2. **两表对齐**：营养表与门店菜单的餐品名需先归一化（去空白、全角括号转半角、去引号）再匹配，否则对不上价签。
3. **限流与兜底**：任何工具 429/超时重试 1 次；仍失败则仅用 `list-nutrition-foods` 完成推荐并注明「价格以门店为准」。
4. **Token 安全**：MCP Token 只在运行时通过连接器/环境变量使用，绝不写入仓库、产物或日志。

## WorkBuddy MCP 配置

```json
{
  "mcpServers": {
    "mcd-mcp": {
      "type": "streamablehttp",
      "url": "https://mcp.mcd.cn",
      "headers": { "Authorization": "Bearer YOUR_MCP_TOKEN" }
    }
  }
}
```
