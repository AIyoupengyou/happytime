#!/usr/bin/env node
/**
 * 从「麦当劳中国 MCP Server」同步餐品与营养数据
 * ------------------------------------------------------------------
 * 服务：https://mcp.mcd.cn （Streamable HTTP + Bearer Token 鉴权）
 * 调用两个 MCP Tool：
 *   · list-nutrition-foods  餐品营养信息列表（能量 / 蛋白质 / 脂肪 / 碳水化合物 / 钠 / 钙）
 *   · query-nearby-stores   查询附近门店（拿到 storeCode）
 *   · query-meals           该门店当前可售卖的餐品菜单（分类 / 编码 / 价格 / 图片 / 标签）
 *
 * 用法：
 *   MCD_MCP_TOKEN=xxx node scripts/fetch-mcd-menu.mjs
 *   可选：MCD_CITY=上海市 MCD_KEYWORD=人民广场
 *
 * 产出：data/menu-snapshot.json（可推荐清单 = 营养表 ∩ 门店在售菜单）
 *
 * 安全：MCP Token 只在运行时通过环境变量读取，绝不写入任何产物或仓库。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'data/menu-snapshot.json')

const TOKEN = process.env.MCD_MCP_TOKEN
const ENDPOINT = process.env.MCD_MCP_ENDPOINT || 'https://mcp.mcd.cn'
const CITY = process.env.MCD_CITY || '上海市'
const KEYWORD = process.env.MCD_KEYWORD || '人民广场'

if (!TOKEN) {
  console.error('✗ 缺少 MCD_MCP_TOKEN，用法：MCD_MCP_TOKEN=xxx node tools/fetch-mcd-menu.mjs')
  process.exit(1)
}

let rpcId = 0

async function rpc(method, params) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const body = await res.json()
  if (body.error) throw new Error(`JSON-RPC 错误：${JSON.stringify(body.error)}`)
  return body.result
}

/** MCP 的 content[].text 里混了说明文字和原始 JSON，这里按大括号配平把 JSON 抠出来 */
function pickJson(text) {
  const start = text.indexOf('{"success"')
  if (start < 0) throw new Error(`返回中未找到 JSON 负载：${text.slice(0, 200)}`)
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return JSON.parse(text.slice(start, i + 1))
    }
  }
  throw new Error('JSON 负载不完整')
}

async function callTool(name, args = {}) {
  const result = await rpc('tools/call', { name, arguments: args })
  if (result?.isError) throw new Error(`工具 ${name} 返回错误`)
  return (result?.content || []).map((c) => c.text || '').join('\n')
}

/** 名称归一化：全角括号 / 空格 / 引号 统一，便于与菜单对齐 */
function normName(s) {
  return String(s || '')
    .replace(/[\s\u3000]/g, '')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[「」“”"']/g, '')
    .trim()
}

function num(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s || s === 'null' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function inferCategory(name) {
  if (/咖啡|拿铁|美式|玛奇朵|卡布奇诺|雪冰|奶铁|阿芙佳朵|鲜萃|浓缩|燕麦奶|抹茶牛奶|黑巧|奶冻/.test(name)) return '咖啡'
  if (/麦满分|粥|油条|豆浆|松饼|薯饼|炒双蛋|营养卷|叠叠卷|早安|猪柳/.test(name)) return '早餐'
  if (/堡|汉堡/.test(name)) return '汉堡'
  if (/薯条|麦乐鸡|鸡块|鸡翅|鸡排|脆汁鸡|鸡球|派|玉米杯|苹果片|沙拉|笋卷|芝士条|炸鸡|V翅|鸡腿|鸡扒/.test(name)) return '小食'
  if (/新地|麦旋风|冰淇淋|圆筒|拉明顿|爆珠/.test(name)) return '甜品'
  if (/可乐|雪碧|牛奶|汁|茶|豆浆|纯悦|怡泉|朱古力|橙|蜂蜜/.test(name)) return '饮品'
  return '其他'
}

function inferTags(name, category) {
  const tags = []
  if (/牛|安格斯|巨无霸|吉士/.test(name)) tags.push('牛肉')
  if (/鸡/.test(name)) tags.push('鸡肉')
  if (/鱼|鳕/.test(name)) tags.push('鱼')
  if (/猪|培根|火腿|香肠/.test(name)) tags.push('猪肉')
  if (/冰|可乐|雪碧|雪冰/.test(name)) tags.push('冰')
  if (/热|粥|咖啡|茶/.test(name)) tags.push('热')
  if (/新地|麦旋风|冰淇淋|圆筒|派|奶冻|爆珠|拉明顿|朱古力/.test(name)) tags.push('甜')
  if (/分享|拼盘|聚会|派对|多人|大份|大杯|10块|4块|2块|双人|全家/.test(name)) tags.push('分享')
  if (/沙拉|玉米|苹果|牛奶|豆浆|鲜蔬|茶|纯悦/.test(name)) tags.push('清爽')
  if (category === '汉堡') tags.push('主食')
  return tags
}

async function main() {
  console.log(`→ 连接 ${ENDPOINT}`)
  const info = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'happytime-jileji', version: '1.0.0' },
  })
  console.log(`✓ 已连接：${info.serverInfo?.name} v${info.serverInfo?.version}`)

  console.log('→ 拉取餐品营养信息（list-nutrition-foods）')
  const nutritionText = await callTool('list-nutrition-foods')
  const nutritionRaw = pickJson(nutritionText)
  if (!nutritionRaw.success) throw new Error(`营养接口失败：${nutritionRaw.message}`)

  const nutrition = new Map()
  const lines = String(nutritionRaw.data).split('\n')
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const p = line.split(',').map((x) => x.trim())
    if (p.length < 9) continue
    nutrition.set(normName(p[0]), {
      name: p[0].trim(),
      energy: num(p[3]),
      protein: num(p[4]),
      fat: num(p[5]),
      carb: num(p[6]),
      sodium: num(p[7]),
      calcium: num(p[8]),
    })
  }
  console.log(`✓ 营养数据 ${nutrition.size} 条`)

  console.log(`→ 查询门店（${CITY} / ${KEYWORD}）`)
  const storeRaw = pickJson(
    await callTool('query-nearby-stores', { beType: 1, searchType: 2, city: CITY, keyword: KEYWORD }),
  )
  const store = Array.isArray(storeRaw.data) ? storeRaw.data.find((s) => s.businessStatus) || storeRaw.data[0] : null
  if (!store?.storeCode) throw new Error(`未查询到门店：${storeRaw.message}`)
  console.log(`✓ 门店：${store.storeName}（${store.storeCode}）`)

  console.log('→ 拉取门店在售餐品（query-meals）')
  const menuRaw = pickJson(
    await callTool('query-meals', { storeCode: store.storeCode, orderType: 1, beType: 1 }),
  )
  const categories = menuRaw.data?.categories || []
  const detail = menuRaw.data?.meals || {}
  const menuOf = new Map()
  for (const c of categories) {
    for (const m of c.meals || []) {
      if (menuOf.has(m.code)) continue
      const d = detail[m.code] || {}
      if (!d.name) continue
      menuOf.set(normName(d.name), {
        code: m.code,
        category: String(c.name || '').replace(/[\n\r]/g, '/').trim(),
        price: num(d.currentPrice),
        originalPrice: num(d.originalPrice),
        image: d.image || null,
        tags: Array.isArray(m.tags) ? m.tags.filter(Boolean) : [],
      })
    }
  }
  console.log(`✓ 在售餐品 ${menuOf.size} 个，来自 ${categories.length} 个分类`)

  // 以营养表为主（每个餐品都有完整营养），能对上菜单的补上价格 / 图片 / 分类 / 标签
  const meals = []
  let matched = 0
  for (const [key, n] of nutrition) {
    const m = menuOf.get(key)
    if (m) matched += 1
    const category = m?.category || inferCategory(n.name)
    const tags = [...new Set([...(m?.tags || []), ...inferTags(n.name, category)])].slice(0, 6)
    meals.push({
      code: m?.code || key,
      name: n.name,
      category,
      tags,
      price: m?.price ?? null,
      image: m?.image ?? null,
      energy: n.energy,
      carb: n.carb,
      protein: n.protein,
      fat: n.fat,
      sodium: n.sodium,
      calcium: n.calcium,
    })
  }
  console.log(`✓ 合并完成：${meals.length} 个餐品（其中 ${matched} 个带价格与图片）`)

  const fetchedAt = new Date().toISOString()
  const snapshot = {
    source: 'mcd-mcp',
    fetchedAt,
    store: {
      code: store.storeCode,
      name: store.storeName,
      address: store.address || '',
      city: CITY,
    },
    meals,
  }

  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(snapshot, null, 2), 'utf8')
  console.log(`✓ 已写入 ${path.relative(ROOT, OUT)}（${meals.length} 个餐品，同步于 ${fetchedAt}）`)
}

main().catch((err) => {
  console.error('✗ 同步失败：', err.message)
  process.exit(1)
})
