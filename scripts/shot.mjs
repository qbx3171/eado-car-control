/**
 * 用 Edge headless + CDP 截图，验证真实渲染效果。
 * 仅开发期使用，不进生产构建。
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const BASE = 'http://127.0.0.1:5173';
const OUT = join(import.meta.dirname, '..', 'shots');
const PROFILE = join(tmpdir(), 'eado-edge-' + Date.now());

mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) 先拿一个有效 token
const loginRes = await fetch('http://127.0.0.1:8787/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '13800138000', code: '123456' }),
});
const { token } = await loginRes.json();
if (!token) throw new Error('登录失败，API 没起来？');

// 2) 起浏览器
const child = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1440,1040',
  'about:blank',
], { stdio: 'ignore' });

let pageWsUrl = null;
for (let i = 0; i < 40; i++) {
  await sleep(300);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page?.webSocketDebuggerUrl) { pageWsUrl = page.webSocketDebuggerUrl; break; }
  } catch { /* 浏览器还没起来 */ }
}
if (!pageWsUrl) { child.kill(); throw new Error('连不上浏览器调试端口'); }

const ws = new WebSocket(pageWsUrl);
await new Promise((r) => ws.once('open', r));

let id = 0;
const waiting = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id);
    waiting.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});

const rpc = (method, params = {}) => new Promise((resolve, reject) => {
  const myId = ++id;
  waiting.set(myId, { resolve, reject });
  ws.send(JSON.stringify({ id: myId, method, params }));
  setTimeout(() => { if (waiting.has(myId)) { waiting.delete(myId); reject(new Error(`超时: ${method}`)); } }, 20000);
});

async function shot(name, w, h) {
  await rpc('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 2, mobile: w < 600,
  });
  await sleep(700);
  const { data } = await rpc('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('saved', name);
}

await rpc('Page.enable');
await rpc('Runtime.enable');

// 3) 登录页
await rpc('Page.navigate', { url: BASE });
await sleep(2600);
await shot('01-login', 1440, 900);

// 4) 注入 token（模拟已登录），再刷新
await rpc('Runtime.evaluate', {
  expression: `localStorage.setItem('eado.token', ${JSON.stringify(token)});
               localStorage.setItem('eado.name', '车主');`,
});
await rpc('Page.navigate', { url: BASE });
await sleep(3200);
await shot('02-home-desktop', 1440, 1040);

// 5) 移动端首页
await shot('03-home-mobile', 390, 900);

// 6) 行程页（桌面）
await rpc('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1040, deviceScaleFactor: 2, mobile: false });
await sleep(600);
await rpc('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('.tab')].find(b=>b.textContent.trim()==='行程')?.click()`,
});
await sleep(1400);
await shot('04-trips', 1440, 1040);

// 7) 展开第一条行程看轨迹
await rpc('Runtime.evaluate', { expression: `document.querySelector('.trip')?.click()` });
await sleep(1200);
await shot('05-trip-detail', 1440, 1100);

// 8) 我的页面（模拟控制台）
await rpc('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('.tab')].find(b=>b.textContent.trim()==='我的')?.click()`,
});
await sleep(1200);
await shot('06-profile', 1440, 1040);

ws.close();
child.kill();
console.log('done');
process.exit(0);
