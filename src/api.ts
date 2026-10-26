import type {
  Vehicle, VehicleState, Capabilities, CommandRecord, Trip, AlertItem, Stats, WsEvent, Snapshot,
} from './types';
import { apiUrl, wsUrl } from './serverConfig';

const TOKEN_KEY = 'eado.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    if (res.status === 401) {
      tokenStore.clear();
      // 通知上层退回登录页：否则 token 过期后界面还在，但每个请求都失败，
      // 用户只会看到满屏"请求失败"，不知道该重新登录。
      window.dispatchEvent(new CustomEvent('eado:unauthorized'));
    }
    throw new ApiError(res.status, data.error || 'ERROR', data.message || '请求失败');
  }
  return data as T;
}

export const api = {
  sendCode: (phone: string) =>
    request<{ ok: boolean; hint: string }>('/api/v1/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  login: (phone: string, code: string) =>
    request<{ token: string; user: { id: string; phone: string; name: string } }>(
      '/api/v1/auth/login',
      { method: 'POST', body: JSON.stringify({ phone, code }) }
    ),

  vehicles: () => request<{ items: Vehicle[] }>('/api/v1/vehicles'),

  state: (vin: string) => request<VehicleState>(`/api/v1/vehicles/${vin}/state`),

  capabilities: (vin: string) =>
    request<Capabilities>(`/api/v1/vehicles/${vin}/capabilities`),

  stats: (vin: string) => request<Stats>(`/api/v1/vehicles/${vin}/stats`),

  issueCommand: (vin: string, type: string, params: Record<string, unknown> = {}) =>
    request<{ command: CommandRecord; duplicate?: boolean }>(
      `/api/v1/vehicles/${vin}/commands`,
      {
        method: 'POST',
        body: JSON.stringify({
          type,
          params,
          // 幂等键：同一次点击只产生一条指令，连点不会重复执行
          idempotencyKey: crypto.randomUUID(),
          clientTs: Date.now(),
        }),
      }
    ),

  commands: (vin: string) =>
    request<{ items: CommandRecord[] }>(`/api/v1/vehicles/${vin}/commands`),

  trips: (vin: string) => request<{ items: Trip[] }>(`/api/v1/vehicles/${vin}/trips`),

  trip: (vin: string, id: string) =>
    request<Trip>(`/api/v1/vehicles/${vin}/trips/${id}`),

  alerts: (vin: string) => request<{ items: AlertItem[] }>(`/api/v1/vehicles/${vin}/alerts`),

  resolveAlert: (vin: string, id: string) =>
    request<{ ok: boolean }>(`/api/v1/vehicles/${vin}/alerts/${id}/resolve`, { method: 'POST' }),

  audit: () => request<{ items: unknown[] }>('/api/v1/audit'),

  snapshots: (vin: string, limit = 12) =>
    request<{ items: Snapshot[] }>(`/api/v1/vehicles/${vin}/snapshots?limit=${limit}`),

  captureSnapshot: (vin: string) =>
    request<{ ok: boolean; snapshot?: Snapshot; code?: string; reason?: string; elapsedMs?: number }>(
      `/api/v1/vehicles/${vin}/snapshots`,
      { method: 'POST' }
    ),

  /**
   * 取一帧图片并转成 blob URL。
   * 走 Authorization 头取图，不让 token 出现在 URL 里；
   * blob URL 用完记得 revoke，见 Camera 页的清理逻辑。
   */
  fetchFrame: async (vin: string, id: string, ch: string): Promise<string> => {
    const res = await fetch(apiUrl(`/api/v1/vehicles/${vin}/snapshots/${id}/frames/${ch}.png`), {
      headers: { Authorization: `Bearer ${tokenStore.get() || ''}` },
    });
    if (!res.ok) throw new ApiError(res.status, 'FRAME_ERROR', '图片加载失败');
    return URL.createObjectURL(await res.blob());
  },

  simulate: (vin: string, patch: Record<string, unknown>) =>
    request<VehicleState>('/api/v1/dev/simulate', {
      method: 'POST',
      body: JSON.stringify({ vin, ...patch }),
    }),
};

/** WebSocket：断线自动重连，重连后自动补订阅 */
export function connectWs(vin: string, onEvent: (e: WsEvent) => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer: number | undefined;

  const open = () => {
    if (closed) return;
    const url = wsUrl(`/ws?token=${encodeURIComponent(tokenStore.get() || '')}`);
    ws = new WebSocket(url);

    ws.onopen = () => {
      retry = 0;
      ws?.send(JSON.stringify({ type: 'subscribe', vin }));
    };

    ws.onmessage = (ev) => {
      try { onEvent(JSON.parse(ev.data)); } catch { /* 忽略非法帧 */ }
    };

    ws.onclose = () => {
      if (closed) return;
      retry += 1;
      // 指数退避，上限 15 秒 —— 别在车离线时把服务端打爆
      const delay = Math.min(15000, 800 * 2 ** Math.min(retry, 4));
      timer = window.setTimeout(open, delay);
    };

    ws.onerror = () => ws?.close();
  };

  open();

  return () => {
    closed = true;
    window.clearTimeout(timer);
    ws?.close();
  };
}
