import { createServer, createRouter, sendJson, HttpError } from './http.js';
import { createBus } from './bus.js';
import { db } from './db.js';
import { initGateways, getGateway } from './gateway/index.js';
import { signToken, verifyToken, DEMO_SMS_CODE } from './auth.js';
import { listVehicles, getState, getCapabilities, todayStats, getVehicleOrThrow } from './services/vehicles.js';
import { createCommandService } from './services/commands.js';
import { createSnapshotService } from './services/snapshots.js';
import { audit, listAudit } from './services/audit.js';
import config from './config.json' with { type: 'json' };
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import os from 'node:os';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');

initGateways(config);

const router = createRouter();
let bus;
let commandService;
let snapshotService;

// ── 鉴权 ─────────────────────────────────────────────────────────────
function requireAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const claims = verifyToken(token);
  if (!claims) throw new HttpError(401, 'UNAUTHORIZED', '登录已失效，请重新登录');
  return claims;
}

const clientMeta = (req) => ({ ip: req.socket.remoteAddress, ua: req.headers['user-agent']?.slice(0, 120) });

// ── 登录 ─────────────────────────────────────────────────────────────
router.post('/api/v1/auth/send-code', (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new HttpError(400, 'INVALID_INPUT', '手机号格式不正确');
  // 演示环境固定验证码；生产接真实短信通道，并加发送频率限制
  sendJson(res, 200, { ok: true, ttl: 300, hint: `演示环境验证码：${DEMO_SMS_CODE}` });
});

router.post('/api/v1/auth/login', (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  const code = String(req.body?.code || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new HttpError(400, 'INVALID_INPUT', '手机号格式不正确');
  if (code !== DEMO_SMS_CODE) throw new HttpError(400, 'INVALID_CODE', '验证码错误');

  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', '该手机号未注册，请先在车辆绑定流程中创建账号');

  audit({ actor: user.id, action: 'auth.login', ...clientMeta(req) });
  sendJson(res, 200, {
    token: signToken({ id: user.id, phone: user.phone, name: user.name }),
    user: { id: user.id, phone: user.phone, name: user.name },
  });
});

router.get('/api/v1/me', (req, res) => {
  const u = requireAuth(req);
  sendJson(res, 200, { id: u.id, phone: u.phone, name: u.name });
});

// ── 车辆 ─────────────────────────────────────────────────────────────
router.get('/api/v1/vehicles', (req, res) => {
  const u = requireAuth(req);
  sendJson(res, 200, { items: listVehicles(u.id) });
});

router.get('/api/v1/vehicles/:vin/state', (req, res) => {
  const u = requireAuth(req);
  sendJson(res, 200, getState(req.params.vin, u.id));
});

router.get('/api/v1/vehicles/:vin/capabilities', (req, res) => {
  const u = requireAuth(req);
  sendJson(res, 200, getCapabilities(req.params.vin, u.id));
});

router.get('/api/v1/vehicles/:vin/stats', (req, res) => {
  const u = requireAuth(req);
  getVehicleOrThrow(req.params.vin, u.id);
  const today = todayStats(req.params.vin);
  const week = db.prepare(
    `SELECT COUNT(*) trips, COALESCE(SUM(distance_km),0) km, COALESCE(SUM(fuel_l),0) fuel,
            COALESCE(SUM(hard_accel),0) ha, COALESCE(SUM(hard_brake),0) hb
     FROM trips WHERE vin = ? AND start_at >= ?`
  ).get(req.params.vin, Date.now() - 7 * 86400e3);

  const score = Math.max(0, Math.min(100, 100 - week.ha * 3 - week.hb * 4));
  sendJson(res, 200, {
    today,
    week: {
      trips: week.trips,
      distanceKm: +week.km.toFixed(1),
      fuelL: +week.fuel.toFixed(2),
      per100km: week.km > 0 ? +((week.fuel / week.km) * 100).toFixed(1) : 0,
      hardAccel: week.ha,
      hardBrake: week.hb,
      drivingScore: score,
    },
  });
});

// ── 指令 ─────────────────────────────────────────────────────────────
router.post('/api/v1/vehicles/:vin/commands', (req, res) => {
  const u = requireAuth(req);
  const result = commandService.issue(req.params.vin, u, req.body, clientMeta(req));
  sendJson(res, result.command?.status === 'REJECTED' ? 200 : 202, result);
});

router.get('/api/v1/vehicles/:vin/commands', (req, res) => {
  const u = requireAuth(req);
  sendJson(res, 200, { items: commandService.list(req.params.vin, u, Number(req.query.limit) || 30) });
});

router.get('/api/v1/vehicles/:vin/commands/:id', (req, res) => {
  const u = requireAuth(req);
  const item = commandService.getById(req.params.vin, req.params.id, u);
  if (!item) throw new HttpError(404, 'NOT_FOUND', '指令不存在');
  sendJson(res, 200, item);
});

// ── 360 环视拍照 ─────────────────────────────────────────────────────
router.post('/api/v1/vehicles/:vin/snapshots', async (req, res) => {
  const u = requireAuth(req);
  const r = await snapshotService.capture(req.params.vin, u, clientMeta(req));
  if (!r.ok) return sendJson(res, 200, r);
  sendJson(res, 201, r);
});

router.get('/api/v1/vehicles/:vin/snapshots', (req, res) => {
  const u = requireAuth(req);
  sendJson(res, 200, { items: snapshotService.list(req.params.vin, u, Number(req.query.limit) || 12) });
});

router.get('/api/v1/vehicles/:vin/snapshots/:id', (req, res) => {
  const u = requireAuth(req);
  const item = snapshotService.getById(req.params.vin, req.params.id, u);
  if (!item) throw new HttpError(404, 'NOT_FOUND', '照片不存在');
  sendJson(res, 200, item);
});

// 原始图片字节：走 Authorization 头而不是 token 放 URL，避免凭证进访问日志
router.get('/api/v1/vehicles/:vin/snapshots/:id/frames/:ch.png', (req, res) => {
  const u = requireAuth(req);
  const snap = snapshotService.getById(req.params.vin, req.params.id, u);
  if (!snap) throw new HttpError(404, 'NOT_FOUND', '照片不存在');
  const ch = String(req.params.ch || '');
  if (!snap.channels.some((c) => c.ch === ch)) throw new HttpError(404, 'NOT_FOUND', '通道不存在');

  const file = join(ROOT, 'data', 'snapshots', snap.id, `${ch}.png`);
  readFile(file)
    .then((buf) => {
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': buf.length,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(buf);
    })
    .catch(() => sendJson(res, 410, { error: 'GONE', message: '图片文件已被清理' }));
});

// ── 行程 ─────────────────────────────────────────────────────────────
router.get('/api/v1/vehicles/:vin/trips', (req, res) => {
  const u = requireAuth(req);
  getVehicleOrThrow(req.params.vin, u.id);
  const rows = db.prepare('SELECT * FROM trips WHERE vin = ? ORDER BY start_at DESC LIMIT 30')
    .all(req.params.vin);
  sendJson(res, 200, { items: rows.map(tripDto) });
});

router.get('/api/v1/vehicles/:vin/trips/:id', (req, res) => {
  const u = requireAuth(req);
  getVehicleOrThrow(req.params.vin, u.id);
  const row = db.prepare('SELECT * FROM trips WHERE id = ? AND vin = ?').get(req.params.id, req.params.vin);
  if (!row) throw new HttpError(404, 'NOT_FOUND', '行程不存在');
  sendJson(res, 200, tripDto(row, true));
});

// ── 告警 ─────────────────────────────────────────────────────────────
router.get('/api/v1/vehicles/:vin/alerts', (req, res) => {
  const u = requireAuth(req);
  getVehicleOrThrow(req.params.vin, u.id);
  const rows = db.prepare('SELECT * FROM alerts WHERE vin = ? ORDER BY created_at DESC LIMIT 30')
    .all(req.params.vin);
  sendJson(res, 200, {
    items: rows.map((r) => ({
      id: r.id, type: r.type, level: r.level, title: r.title,
      detail: r.detail, createdAt: r.created_at, resolved: !!r.resolved_at,
    })),
  });
});

router.post('/api/v1/vehicles/:vin/alerts/:id/resolve', (req, res) => {
  const u = requireAuth(req);
  getVehicleOrThrow(req.params.vin, u.id);
  db.prepare('UPDATE alerts SET resolved_at = ? WHERE id = ?').run(Date.now(), req.params.id);
  audit({ actor: u.id, action: 'alert.resolve', vin: req.params.vin, payload: { id: req.params.id } });
  sendJson(res, 200, { ok: true });
});

// ── 审计 ─────────────────────────────────────────────────────────────
router.get('/api/v1/audit', (req, res) => {
  requireAuth(req);
  sendJson(res, 200, { items: listAudit(Number(req.query.limit) || 50) });
});

// ── 演示辅助：把车开起来 / 断电，用来验证安全拦截 ────────────────────
router.post('/api/v1/dev/simulate', (req, res) => {
  const u = requireAuth(req);
  const vin = String(req.body?.vin || '');
  getVehicleOrThrow(vin, u.id);
  const gw = getGateway('mock');
  if (typeof gw.setSimulation !== 'function') {
    throw new HttpError(400, 'NOT_SUPPORTED', '当前网关不支持模拟');
  }
  const st = gw.setSimulation(vin, req.body || {});
  audit({ actor: u.id, action: 'dev.simulate', vin, payload: req.body });
  sendJson(res, 200, st);
});

router.get('/healthz', (req, res) => {
  sendJson(res, 200, { ok: true, ts: Date.now(), uptime: Math.round(process.uptime()) });
});

// ── 静态资源（生产构建产物）───────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res) {
  if (req.method !== 'GET') return false;
  let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (pathname === '/') pathname = '/index.html';

  // 防目录穿越：规范化后必须仍在 dist 内
  const target = normalize(join(DIST, pathname));
  if (!target.startsWith(DIST)) return false;

  try {
    const s = await stat(target);
    if (!s.isFile()) return false;
    const buf = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target)] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(buf);
    return true;
  } catch {
    // SPA 回退
    try {
      const buf = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(buf);
      return true;
    } catch {
      return false;
    }
  }
}

const server = createServer(async (req, res) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/healthz')) {
    return router.handle(req, res);
  }
  if (await serveStatic(req, res)) return;
  sendJson(res, 404, {
    error: 'NOT_FOUND',
    message: '前端尚未构建。开发环境请访问 Vite 端口，生产环境请先执行 npm run build。',
  });
});

bus = createBus(server);
commandService = createCommandService({ bus });
snapshotService = createSnapshotService({ bus });

// 车辆状态 → WebSocket：网关是唯一数据源，订阅一次全量转发
const allVehicles = db.prepare('SELECT vin, gateway_kind FROM vehicles').all();
for (const v of allVehicles) {
  const gw = getGateway(v.gateway_kind);
  gw.subscribe(v.vin, (state) => bus.publish(v.vin, 'vehicle.state', state));
}

function tripDto(r, withTrack = false) {
  const dto = {
    id: r.id,
    startAt: r.start_at,
    endAt: r.end_at,
    distanceKm: r.distance_km,
    fuelL: r.fuel_l,
    avgSpeed: r.avg_speed,
    maxSpeed: r.max_speed,
    hardAccel: r.hard_accel,
    hardBrake: r.hard_brake,
    startAddr: r.start_addr,
    endAddr: r.end_addr,
    durationMin: Math.round((r.end_at - r.start_at) / 60000),
  };
  if (withTrack) dto.track = JSON.parse(r.track || '[]');
  return dto;
}

// 监听 0.0.0.0 是手机 App 能连上的前提：只听 127.0.0.1 时，
// 手机即使在同一 WiFi 也会被系统拒绝连接。
server.listen(config.port, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);

  console.log(`\n  逸动PLUS 车云控制台 · API 已启动`);
  console.log(`  本机:   http://localhost:${config.port}`);
  for (const ip of lan) console.log(`  局域网: http://${ip}:${config.port}   ← 手机 App 填这个`);
  console.log(`  已注册网关: ${allVehicles.map((v) => v.gateway_kind).join(', ')}`);
  console.log(`  车辆数: ${allVehicles.length}\n`);
});

process.on('SIGINT', () => { server.close(() => process.exit(0)); });
