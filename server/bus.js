import { WebSocketServer } from 'ws';
import { verifyToken } from './auth.js';

/**
 * 实时通道。控车的"成功"必须由这里推回去，
 * 而不是靠 HTTP 200 —— 这个区别决定了用户会不会被骗。
 */
export function createBus(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const conns = new Set();

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const claims = verifyToken(url.searchParams.get('token'));
    if (!claims) {
      ws.close(4001, '未授权');
      return;
    }

    const conn = { ws, claims, vins: new Set() };
    conns.add(conn);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'subscribe' && typeof msg.vin === 'string') {
        conn.vins.add(msg.vin);
      } else if (msg.type === 'unsubscribe' && typeof msg.vin === 'string') {
        conn.vins.delete(msg.vin);
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', at: Date.now() }));
      }
    });

    ws.on('close', () => conns.delete(conn));
    ws.on('error', () => conns.delete(conn));

    ws.send(JSON.stringify({ type: 'ready', at: Date.now() }));
  });

  /** 只推给订阅了该 VIN 且属于该车主的连接 */
  function publish(vin, type, payload) {
    const frame = JSON.stringify({ type, vin, payload, at: Date.now() });
    for (const c of conns) {
      if (!c.vins.has(vin)) continue;
      if (c.ws.readyState !== c.ws.OPEN) continue;
      try { c.ws.send(frame); } catch { /* ignore */ }
    }
  }

  return { publish, size: () => conns.size };
}
