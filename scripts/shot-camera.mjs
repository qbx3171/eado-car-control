/**
 * 360 环视页截图验证：进全景页 → 点拍照 → 等待回传 → 鸟瞰/单通道各截一张。
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9334;
const BASE = 'http://127.0.0.1:5173';
const OUT = join(import.meta.dirname, '..', 'shots');
const PROFILE = join(tmpdir(), 'eado-edge-' + Date.now());

mkdirSync(join(OUT, 'camera'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const loginRes = await fetch('http://127.0.0.1:8787/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '13800138000', code: '123456' }),
});
const { token } = await loginRes.json();
if (!token) throw new Error('登录失败，API 没起来？');

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1440,1040', 'about:blank',
], { stdio: 'ignore' });

let pageWsUrl = null;
for (let i = 0; i < 40; i++) {
  await sleep(300);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page?.webSocketDebuggerUrl) { pageWsUrl = page.webSocketDebuggerUrl; break; }
  } catch { /* 还没起来 */ }
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
  setTimeout(() => { if (waiting.has(myId)) { waiting.delete(myId); reject(new Error(`超时: ${method}`)); } }, 25000);
});
async function shot(name, w = 1440, h = 1040) {
  await rpc('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w < 600 });
  await sleep(600);
  const { data } = await rpc('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(OUT, 'camera', `${name}.png`), Buffer.from(data, 'base64'));
  console.log('saved', name);
}

await rpc('Page.enable');
await rpc('Runtime.enable');

await rpc('Page.navigate', { url: BASE });
await sleep(2500);
await rpc('Runtime.evaluate', {
  expression: `localStorage.setItem('eado.token', ${JSON.stringify(token)});
               localStorage.setItem('eado.name', '车主');`,
});
await rpc('Page.navigate', { url: BASE });
await sleep(3000);

// 桌面端：进全景页
await rpc('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('.tab')].find(b=>b.textContent.trim()==='全景')?.click()`,
});
await sleep(1500);
await shot('c1-empty', 1440, 1040);

// 点拍照
await rpc('Runtime.evaluate', { expression: `document.querySelector('.cam-capture')?.click()` });
await sleep(1200);
await shot('c2-capturing', 1440, 1040);
await sleep(3500); // 拍摄 + 图片回传
await shot('c3-birdview', 1440, 1100);

// 单通道
await rpc('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('.seg button')].find(b=>b.textContent.trim()==='单通道')?.click()`,
});
await sleep(1000);
await shot('c4-single', 1440, 1100);

// 移动端鸟瞰
await rpc('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('.seg button')].find(b=>b.textContent.trim()==='环视鸟瞰')?.click()`,
});
await sleep(800);
await shot('c5-bird-mobile', 390, 900);

// 移动端首页入口
await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true });
await rpc('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('.nav-item')].find(b=>b.textContent.trim()==='车辆')?.click()`,
});
await sleep(1200);
await rpc('Runtime.evaluate', { expression: `document.querySelector('.cam-entry')?.scrollIntoView({block:'center'})` });
await sleep(600);
await shot('c6-entry-mobile', 390, 900);

ws.close();
child.kill();
console.log('done');
process.exit(0);
