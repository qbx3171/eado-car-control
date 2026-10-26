import { db } from '../db.js';
import { getGateway } from '../gateway/index.js';
import { HttpError } from '../http.js';
import config from '../config.json' with { type: 'json' };

const STATE_PERSIST_INTERVAL = 30_000;
const lastPersist = new Map();

export function listVehicles(ownerId) {
  const rows = db.prepare('SELECT * FROM vehicles WHERE owner_id = ? ORDER BY created_at').all(ownerId);
  return rows.map((r) => ({
    vin: r.vin,
    model: r.model,
    plate: r.plate,
    gateway: r.gateway_kind,
    online: isOnline(r.vin, r.gateway_kind, r.last_seen_at),
    lastSeenAt: r.last_seen_at,
  }));
}

/** 归属校验是越权防护的第一道闸，任何涉车接口都必须先过这一关 */
export function getVehicleOrThrow(vin, ownerId) {
  const row = db.prepare('SELECT * FROM vehicles WHERE vin = ?').get(vin);
  if (!row) throw new HttpError(404, 'VEHICLE_NOT_FOUND', '车辆不存在');
  if (row.owner_id !== ownerId) throw new HttpError(403, 'UNAUTHORIZED', '无权操作该车辆');
  return row;
}

export function getCapabilities(vin, ownerId) {
  const v = getVehicleOrThrow(vin, ownerId);
  return getGateway(v.gateway_kind).capabilities(vin);
}

export function getState(vin, ownerId) {
  const v = getVehicleOrThrow(vin, ownerId);
  const gw = getGateway(v.gateway_kind);
  const state = gw.getState(vin);
  const online = isOnline(vin, v.gateway_kind, v.last_seen_at, state);

  // 节流落库：车况是高频流，全量写盘没意义，30 秒留一个快照够回溯
  const last = lastPersist.get(vin) ?? 0;
  if (Date.now() - last > STATE_PERSIST_INTERVAL) {
    lastPersist.set(vin, Date.now());
    db.prepare('INSERT INTO vehicle_states (vin, snapshot, captured_at) VALUES (?,?,?)')
      .run(vin, JSON.stringify(state), state.capturedAt ?? Date.now());
    db.prepare('UPDATE vehicles SET online = ?, last_seen_at = ? WHERE vin = ?')
      .run(online ? 1 : 0, Date.now(), vin);
  }

  return { ...state, online };
}

export function isOnline(vin, gatewayKind, lastSeenAt, state) {
  if (gatewayKind === 'mock') return state ? state.online !== false : true;
  return Date.now() - (lastSeenAt || 0) < config.offlineThresholdMs;
}

export function todayStats(vin) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const row = db.prepare(
    `SELECT COUNT(*) AS trips, COALESCE(SUM(distance_km),0) AS km,
            COALESCE(AVG(avg_speed),0) AS avg_spd,
            COALESCE(SUM(hard_accel + hard_brake),0) AS harsh
     FROM trips WHERE vin = ? AND start_at >= ?`
  ).get(vin, start.getTime());
  return {
    trips: row.trips,
    distanceKm: +row.km.toFixed(1),
    avgSpeed: +row.avg_spd.toFixed(1),
    harshCount: row.harsh,
  };
}
