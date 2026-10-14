// 渲染 example-output 下的样例 HTML 为 PNG，用于 README 配图
// 用法: node scripts/render-preview.mjs
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// playwright 装在 WorkBuddy 的托管 node 工作区，用 createRequire 显式解析
const req = createRequire(process.env.WB_NODE_WORKSPACE || '/tmp/');
const { chromium } = req('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'images');
fs.mkdirSync(outDir, { recursive: true });

const jobs = [
  { file: 'example-output/happytime-card-sample.html', out: 'preview-happytime-card.png', scale: 2 },
  { file: 'example-output/postcard-sample.html', out: 'preview-postcard.png', scale: 2 },
];

const browser = await chromium.launch();
for (const job of jobs) {
  const page = await browser.newPage({ deviceScaleFactor: job.scale });
  await page.goto(pathToFileURL(path.join(root, job.file)).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  // 把卡片贴到左上角（去掉居中/页边距），再按卡片尺寸截图；
  // 高度取 scrollHeight 兜底，避免溢出内容（如落款日期）被截断
  const box = await page.evaluate(() => {
    const el = [...document.body.children].find(
      (c) => c.offsetWidth > 50 && c.offsetHeight > 50
    );
    el.style.margin = '0';
    el.style.position = 'static';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.display = 'block';
    return {
      width: el.offsetWidth,
      height: Math.max(el.offsetHeight, el.scrollHeight),
    };
  });
  await page.setViewportSize({ width: box.width, height: box.height });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: path.join(outDir, job.out), clip: { x: 0, y: 0, ...box } });
  console.log(`✅ ${job.out}  ${box.width}x${box.height} @${job.scale}x`);
  await page.close();
}
await browser.close();
