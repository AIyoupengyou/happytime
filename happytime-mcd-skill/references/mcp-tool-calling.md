# 麦当劳中国 MCP 调用约定

## 基本信息

- 接入地址：`https://mcp.mcd.cn`
- 协议：Streamable HTTP（JSON-RPC 2.0）
- 认证：请求头 `Authorization: Bearer <MCP_TOKEN>`
- 限流：每 Token 600 次/分钟，超限返回 429
- 错误码：401 = Token 无效/过期/未提供；429 = 触发限流（降低调用频率，等 60s 或重试一次）

## 本技能用到的工具

| 工具 | 用途 | 关键参数 |
|---|---|---|
| `now-time-info` | 当前日期时间（明信片落款） | 无 |
| `list-nutrition-foods` | 餐品营养信息列表（158 条左右） | 无；一次拉全量 |
| `query-nearby-stores` | 查询附近门店，拿 `storeCode` | `beType: 1, searchType: 2, city, keyword` |
| `query-meals` | 门店在售菜单（分类/编码/价格/标签） | `storeCode, orderType: 1, beType: 1` |
| `query-meal-detail` | 套餐组成详情 | 餐品编码 |
| `query-store-coupons` | 当前门店可用优惠券 | 门店编码 |
| `available-coupons` | 麦麦省可领券列表 | 无 |
| `auto-bind-coupons` | 一键领取麦麦省全部可用券 | 无 |
| `calculate-price` | 按商品列表算价（含券/配送费） | 门店 + 商品列表 |
| `create-order` | 创建订单（返回支付链接） | 门店 + 就餐方式 + 商品列表；**必须先获用户确认** |
| `query-nearby-stores` 的返回里 `businessStatus` 为真的门店才可用 | 选第一个可用门店 | — |

## 直连（脚本）调用方式

WorkBuddy 内通过 `mcd-mcp` 连接器调用即可。若用 Node 脚本直连，参考 `scripts/fetch-mcd-menu.mjs`：

```jsonc
// JSON-RPC 调用 tools/call
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "list-nutrition-foods", "arguments": {} } }
// 请求头：Content-Type: application/json
//        Accept: application/json, text/event-stream
//        Authorization: Bearer <TOKEN>
```

## 两个必须注意的解析坑

1. **`content[].text` 混排**：返回的 text 里混有说明文字和原始 JSON。先找 `{"success"` 起点，再做大括号配平（处理字符串内的转义与引号）截出完整 JSON 再 parse。见 `scripts/fetch-mcd-menu.mjs` 的 `pickJson`。
2. **名称归一化**：营养表与菜单的餐品名要按归一化键对齐——去掉所有空白、全角括号转半角、去掉「」“”引号。见脚本的 `normName`。

## 产品图本地化（重要）

菜单返回的餐品图在 `menu-img.mcd.cn`，该域名**没有 CORS 头**：浏览器里直接外链画进 Canvas 会污染画布、导出失败。做法是把图**预先下载到本地** `assets/products/{餐品编码}.png`，运行时只画本地资源（重跑菜单同步后要补下新图）。在 WorkBuddy 对话场景里没有 Canvas 限制，但为了产出物稳定（离线可渲染、路径可控），同样建议用本地插画。

## 安全红线

- Token 只放环境变量（`MCD_MCP_TOKEN`）或连接器配置，绝不写入产物、明信片、仓库。
- `create-order` 涉及真实交易：下单前必须复述门店、餐品、价格并获用户明确确认。
