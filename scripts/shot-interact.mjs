/** 控车交互闭环验证：解锁 → 二次确认 → 执行 → 车端回执 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9334;
const BASE = 'http://127.0.0.1:5173';
const OUT = join(import.meta.dirname, '..', 'shots');
const PROFILE = join(import.meta.dirname, '..', '.edge-profile-tmp');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { token } = await (
  await fetch('http://127.0.0.1:8787/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800138000', code: '123456' }),
  })
).json();

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1040', 'about:blank',
], { stdio: 'ignore' });

let pageWsUrl = null;
for (let i = 0; i < 40; i++) {
  await sleep(300);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page?.webSocketDebuggerUrl) { pageWsUrl = page.webSocketDebuggerUrl; break; }
  } catch { /* retry */ }
}

const ws = new WebSocket(pageWsUrl);
await new Promise((r) => ws.once('open', r));
let id = 0;
const waiting = new Map();
ws.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && waiting.has(m.id)) {
    const { resolve, reject } = waiting.get(m.id);
    waiting.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
});
const rpc = (method, params = {}) => new Promise((resolve, reject) => {
  const myId = ++id;
  waiting.set(myId, { resolve, reject });
  ws.send(JSON.stringify({ id: myId, method, params }));
  setTimeout(() => waiting.has(myId) && (waiting.delete(myId), reject(new Error('timeout ' + method))), 20000);
});

const shot = async (name) => {
  await sleep(500);
  const { data } = await rpc('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('saved', name);
};
const evalJs = async (expr) => {
  const r = await rpc('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.value;
};

await rpc('Page.enable');
await rpc('Runtime.enable');
await rpc('Page.navigate', { url: BASE });
await sleep(2400);
await evalJs(`localStorage.setItem('eado.token', ${JSON.stringify(token)}); localStorage.setItem('eado.name','车主');`);
await rpc('Page.navigate', { url: BASE });
await sleep(3200);

// 1) 点"解锁"（高风险指令 → 应弹二次确认）
await evalJs(`[...document.querySelectorAll('.cmd-btn')].find(b=>b.textContent.includes('解锁'))?.click()`);
await sleep(800);
await shot('10-confirm-dialog');

// 2) 确认执行
await evalJs(`[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('确认执行'))?.click()`);
await sleep(700);
await shot('11-command-pending');

// 3) 等车端回执（1~2.5s 延迟 + 余量）
await sleep(3200);
await shot('12-command-acked');

// 4) 车辆解锁状态应体现在俯视图（已解锁徽章）
const badge = await evalJs(`document.querySelector('.hero [style*="已解锁"]')?.textContent || [...document.querySelectorAll('.hero div')].map(d=>d.textContent).find(t=>t&&(t.includes('已解锁')||t.includes('已锁车'))) || '未找到状态徽章'`);
console.log('状态徽章:', badge);

ws.close();
child.kill();
console.log('done');
process.exit(0);
