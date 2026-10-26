/**
 * 运行时服务器地址配置。
 *
 * 为什么需要这一层：
 * Web 端由后端同源托管，用相对路径即可；但 APK 的页面运行在 capacitor://localhost，
 * 相对路径会打到手机本地，必然失败。所以 APP 里必须带一个可修改的服务器地址。
 *
 * 设计原则：地址存 localStorage，不写死在包里 —— 换服务器/换网络不用重新打包。
 */

const SERVER_KEY = 'eado.server';

/**
 * 打包时注入的默认服务器地址（`VITE_DEFAULT_SERVER`）。
 * 用途：出一版"开箱即连"的 APK，用户装完不用手填地址。
 * 运行时用户仍可覆盖，覆盖后以 localStorage 为准。
 */
const DEFAULT_SERVER = String(import.meta.env.VITE_DEFAULT_SERVER || '')
  .trim()
  .replace(/\/+$/, '');

/** 判断是否运行在 Capacitor 壳内（APK / iOS） */
export function isNativeApp(): boolean {
  const p = location.protocol;
  if (p === 'capacitor:' || p === 'ionic:') return true;
  // Capacitor Android 默认 https://localhost，iOS 为 capacitor://localhost
  if (p === 'https:' && location.hostname === 'localhost') return true;
  return false;
}

/** 读取用户配置的服务器地址，去掉尾部斜杠；没配置过则回落到打包默认值 */
export function getServerUrl(): string {
  const saved = localStorage.getItem(SERVER_KEY);
  if (saved !== null) return saved.trim().replace(/\/+$/, '');
  return DEFAULT_SERVER;
}

/** 是否使用打包内置的默认地址（用于界面上提示"默认服务器"） */
export function isDefaultServer(): boolean {
  return localStorage.getItem(SERVER_KEY) === null && !!DEFAULT_SERVER;
}

export function setServerUrl(url: string) {
  const v = url.trim().replace(/\/+$/, '');
  if (v) localStorage.setItem(SERVER_KEY, v);
  else localStorage.removeItem(SERVER_KEY);
}

/**
 * 规范化用户输入：允许只填 "192.168.1.5:8787" 或 "192.168.1.5"，
 * 自动补 http:// 和默认端口。手机键盘输入 IP 很容易漏协议头。
 */
export function normalizeServerUrl(raw: string): string {
  let v = raw.trim().replace(/\/+$/, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
  try {
    const u = new URL(v);
    if (!u.port && u.protocol === 'http:') u.port = '8787';
    return u.origin;
  } catch {
    return '';
  }
}

/** 拼接请求地址：Web 同源用相对路径，APP 用绝对地址 */
export function apiUrl(path: string): string {
  const base = getServerUrl();
  if (base) return base + path;
  if (isNativeApp()) return path; // 没配地址时保持相对路径，让错误在界面上暴露出来
  return path;
}

/** WebSocket 地址：由 HTTP 地址推导 ws/wss */
export function wsUrl(path: string): string {
  const base = getServerUrl();
  if (base) {
    return base.replace(/^http/i, 'ws') + path;
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}${path}`;
}

/**
 * 连通性探测：登录前先验一下地址通不通，
 * 免得用户对着"登录失败"猜是密码错还是网络错。
 */
export async function probeServer(base: string, timeoutMs = 4000): Promise<{ ok: boolean; message: string }> {
  const url = normalizeServerUrl(base);
  if (!url) return { ok: false, message: '地址格式不对，示例：192.168.1.5:8787' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url + '/healthz', { signal: ctrl.signal });
    if (!res.ok) return { ok: false, message: `服务器返回 ${res.status}` };
    const data = await res.json().catch(() => ({}));
    if (data && data.ok) return { ok: true, message: '已连接' };
    return { ok: false, message: '这个地址不是本系统的服务' };
  } catch {
    return { ok: false, message: '连不上，检查手机和电脑是否在同一 WiFi、后端是否已启动' };
  } finally {
    clearTimeout(timer);
  }
}
