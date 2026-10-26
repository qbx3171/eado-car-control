import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DB_FILE = join(ROOT, 'data', 'eado.db');

mkdirSync(dirname(DB_FILE), { recursive: true });

export const db = new DatabaseSync(DB_FILE);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  phone       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id            TEXT PRIMARY KEY,
  vin           TEXT UNIQUE NOT NULL,
  model         TEXT NOT NULL,
  plate         TEXT NOT NULL,
  owner_id      TEXT NOT NULL REFERENCES users(id),
  gateway_kind  TEXT NOT NULL,
  online        INTEGER NOT NULL DEFAULT 0,
  last_seen_at  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

-- 车况快照：只保留最近 N 条，模拟量不追求完整时序库（生产应换 TimescaleDB）
CREATE TABLE IF NOT EXISTS vehicle_states (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  vin         TEXT NOT NULL,
  snapshot    TEXT NOT NULL,
  captured_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_states_vin_time ON vehicle_states(vin, captured_at DESC);

CREATE TABLE IF NOT EXISTS commands (
  id          TEXT PRIMARY KEY,
  vin         TEXT NOT NULL,
  type        TEXT NOT NULL,
  params      TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL,
  idem_key    TEXT NOT NULL,
  issued_by   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  acked_at    INTEGER,
  fail_code   TEXT,
  fail_reason TEXT,
  UNIQUE(vin, idem_key)
);
CREATE INDEX IF NOT EXISTS idx_cmd_vin_time ON commands(vin, created_at DESC);

CREATE TABLE IF NOT EXISTS trips (
  id          TEXT PRIMARY KEY,
  vin         TEXT NOT NULL,
  start_at    INTEGER NOT NULL,
  end_at      INTEGER NOT NULL,
  distance_km REAL NOT NULL,
  fuel_l      REAL NOT NULL,
  avg_speed   REAL NOT NULL,
  max_speed   REAL NOT NULL,
  hard_accel  INTEGER NOT NULL DEFAULT 0,
  hard_brake  INTEGER NOT NULL DEFAULT 0,
  start_addr  TEXT,
  end_addr    TEXT,
  track       TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_trips_vin_time ON trips(vin, start_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id          TEXT PRIMARY KEY,
  vin         TEXT NOT NULL,
  type        TEXT NOT NULL,
  level       TEXT NOT NULL,
  title       TEXT NOT NULL,
  detail      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER
);

-- 360 环视拍照记录：图片文件在 data/snapshots/<id>/ 下，这里只存元数据
CREATE TABLE IF NOT EXISTS snapshots (
  id           TEXT PRIMARY KEY,
  vin          TEXT NOT NULL,
  captured_at  INTEGER NOT NULL,
  requested_by TEXT,
  channels     TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_snap_vin_time ON snapshots(vin, captured_at DESC);

-- 审计日志：只增不改，控车系统的追责依据
CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor      TEXT,
  action     TEXT NOT NULL,
  vin        TEXT,
  payload    TEXT,
  ip         TEXT,
  ua         TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at DESC);
`);

const now = Date.now();

// ── 种子数据：演示用只有一台车、一个账号 ────────────────────────────
const seeded = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
if (!seeded) {
  const userId = 'u_1001';
  const vin = 'LEADO2026DEMO00001';

  db.prepare('INSERT INTO users (id, phone, name, created_at) VALUES (?, ?, ?, ?)')
    .run(userId, '13800138000', '车主', now);

  db.prepare(
    `INSERT INTO vehicles (id, vin, model, plate, owner_id, gateway_kind, online, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run('v_1001', vin, '逸动PLUS 1.4T GDI DCT 尊贵型', '粤B·8K2M6', userId, 'mock', 1, now, now);

  const trips = [
    ['t_1', now - 2 * 86400e3 - 3 * 3600e3, now - 2 * 86400e3 - 1700e3, 18.6, 1.42, 38.2, 82, 1, 0, '南山区科技园', '福田区会展中心'],
    ['t_2', now - 86400e3 - 9 * 3600e3, now - 86400e3 - 8 * 3600e3 + 600e3, 32.4, 2.51, 45.1, 96, 0, 1, '福田区会展中心', '宝安国际机场'],
    ['t_3', now - 86400e3 - 30 * 60e3, now - 86400e3 - 60e3, 9.8, 0.78, 24.6, 58, 0, 0, '宝安国际机场', '南山区科技园'],
    ['t_4', now - 3600e3 * 6, now - 3600e3 * 5.4, 6.2, 0.49, 21.3, 47, 2, 1, '南山区科技园', '海岸城'],
    ['t_5', now - 3600e3 * 5.3, now - 3600e3 * 4.9, 5.9, 0.46, 19.8, 44, 0, 0, '海岸城', '南山区科技园'],
  ];
  const insTrip = db.prepare(
    `INSERT INTO trips (id, vin, start_at, end_at, distance_km, fuel_l, avg_speed, max_speed,
       hard_accel, hard_brake, start_addr, end_addr, track) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  for (const [id, s, e, d, f, a, m, ha, hb, sa, ea] of trips) {
    insTrip.run(id, vin, s, e, d, f, a, m, ha, hb, sa, ea, JSON.stringify(buildTrack(s, e, d)));
  }

  const insAlert = db.prepare(
    'INSERT INTO alerts (id, vin, type, level, title, detail, created_at) VALUES (?,?,?,?,?,?,?)'
  );
  insAlert.run('a_1', vin, 'TIRE', 'warn', '右后轮胎压偏低', '2.30 bar，低于建议值 2.40 bar，建议尽快补气', now - 5 * 3600e3);
  insAlert.run('a_2', vin, 'MAINTENANCE', 'info', '距离下次保养还有 580 km', '上次保养 33,840 km，建议 39,000 km 前完成', now - 26 * 3600e3);

  db.prepare('INSERT INTO audit_logs (actor, action, vin, payload, ip, ua, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(userId, 'seed.init', vin, JSON.stringify({ gateway: 'mock' }), '-', 'system', now);
}

/** 生成一条平滑的演示轨迹（起点南山，终点随机偏移），仅用于 UI 展示 */
function buildTrack(startAt, endAt, distanceKm) {
  const pts = [];
  const n = 18;
  const baseLat = 22.5431;
  const baseLng = 114.0579;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push({
      t: Math.round(startAt + (endAt - startAt) * t),
      lat: +(baseLat + Math.sin(t * Math.PI) * 0.021 - t * 0.008).toFixed(6),
      lng: +(baseLng + t * 0.035 + Math.cos(t * Math.PI) * 0.004).toFixed(6),
      spd: Math.round(20 + Math.sin(t * Math.PI) * 45),
    });
  }
  return pts;
}

export const nowMs = () => Date.now();
