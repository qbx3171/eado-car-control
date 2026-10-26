/**
 * 360 环视拍照服务。
 *
 * 走独立的 REST 端点而不是指令管道，原因是它有"产物"（图片），
 * 而指令状态机的回执语义（ACKED/FAILED）不足以描述一次成功的拍摄。
 * 但安全约束与指令完全一致：离线不拍、超速不拍、全程审计。
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db.js';
import { getGateway } from '../gateway/index.js';
import { getVehicleOrThrow } from './vehicles.js';
import { audit } from './audit.js';

const ROOT = join(import.meta.dirname, '..', '..');
const DIR = join(ROOT, 'data', 'snapshots');
const MAX_KEEP = 24; // 滚动保留最近 N 次，图片很占磁盘

export function createSnapshotService({ bus }) {
  function gatewayFor(vin) {
    const row = db.prepare('SELECT gateway_kind g FROM vehicles WHERE vin = ?').get(vin);
    return getGateway(row.g);
  }

  async function capture(vin, user, meta = {}) {
    getVehicleOrThrow(vin, user.id);
    const gw = gatewayFor(vin);

    if (typeof gw.captureSnapshot !== 'function') {
      throw Object.assign(new Error('当前网关不支持环视拍照'), {
        status: 400, code: 'NOT_SUPPORTED', expose: true,
      });
    }

    const startedAt = Date.now();
    audit({ actor: user.id, action: 'snapshot.request', vin, payload: { kind: '360' }, ...meta });

    const res = await gw.captureSnapshot(vin);
    if (!res.ok) {
      audit({
        actor: user.id, action: 'snapshot.rejected', vin,
        payload: { code: res.code, reason: res.reason }, ...meta,
      });
      return { ok: false, code: res.code, reason: res.reason, elapsedMs: Date.now() - startedAt };
    }

    const id = `snap_${randomUUID().slice(0, 10)}`;
    mkdirSync(join(DIR, id), { recursive: true });

    const channels = res.frames.map((f) => ({
      ch: f.ch,
      width: f.width,
      height: f.height,
      bytes: f.png.length,
    }));
    for (const f of res.frames) {
      writeFileSync(join(DIR, id, `${f.ch}.png`), f.png);
    }

    db.prepare(
      'INSERT INTO snapshots (id, vin, captured_at, requested_by, channels) VALUES (?,?,?,?,?)'
    ).run(id, vin, res.capturedAt, user.id, JSON.stringify(channels));

    prune(vin);
    const snap = getById(vin, id, user);
    bus.publish(vin, 'snapshot.ready', snap);
    audit({
      actor: user.id, action: 'snapshot.done', vin,
      payload: { id, ms: Date.now() - startedAt, frames: channels.length }, ...meta,
    });

    return { ok: true, snapshot: snap, elapsedMs: Date.now() - startedAt };
  }

  function toDto(r) {
    let channels = [];
    try { channels = JSON.parse(r.channels || '[]'); } catch { /* 容忍坏行 */ }
    return { id: r.id, vin: r.vin, capturedAt: r.captured_at, requestedBy: r.requested_by, channels };
  }

  function getById(vin, id, user) {
    getVehicleOrThrow(vin, user?.id);
    const row = db.prepare('SELECT * FROM snapshots WHERE id = ? AND vin = ?').get(id, vin);
    return row ? toDto(row) : null;
  }

  function list(vin, user, limit = 12) {
    getVehicleOrThrow(vin, user.id);
    return db.prepare('SELECT * FROM snapshots WHERE vin = ? ORDER BY captured_at DESC LIMIT ?')
      .all(vin, limit).map(toDto);
  }

  function prune(vin) {
    const rows = db.prepare(
      'SELECT id FROM snapshots WHERE vin = ? ORDER BY captured_at DESC LIMIT -1 OFFSET ?'
    ).all(vin, MAX_KEEP);
    for (const r of rows) {
      rmSync(join(DIR, r.id), { recursive: true, force: true });
      db.prepare('DELETE FROM snapshots WHERE id = ?').run(r.id);
    }
  }

  return { capture, list, getById };
}
