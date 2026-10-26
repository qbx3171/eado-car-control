import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { getGateway } from '../gateway/index.js';
import { COMMAND_DEFS, REJECT_REASONS } from '../../shared/contract.js';
import { getState, getVehicleOrThrow } from './vehicles.js';
import { audit } from './audit.js';
import config from '../config.json' with { type: 'json' };

const TTL = config.commandTtlMs;
const MAX_CLOCK_SKEW = 60_000;

/**
 * 安全规则表。新增一条规则 = 加一行，不散落在业务代码里。
 * 这些不是产品优化，是红线：车在跑的时候开后备箱会死人。
 */
const SAFETY_RULES = [
  {
    code: 'VEHICLE_MOVING',
    types: ['UNLOCK', 'TRUNK_OPEN', 'WINDOW_OPEN'],
    test: (st) => (st.speed ?? 0) > 0,
  },
  {
    code: 'LOW_FUEL',
    types: ['ENGINE_START'],
    test: (st) => st.fuel?.level != null && st.fuel.level < 5,
  },
];

export function createCommandService({ bus }) {
  const timers = new Map();

  function issue(vin, user, input, meta = {}) {
    const now = Date.now();
    const type = String(input?.type || '');
    const idemKey = String(input?.idempotencyKey || '');
    const params = input?.params && typeof input.params === 'object' ? input.params : {};

    if (!COMMAND_DEFS[type]) {
      throw Object.assign(new Error('不支持的指令类型'), { status: 400, code: 'INVALID_INPUT', expose: true });
    }
    if (!idemKey || idemKey.length > 64) {
      throw Object.assign(new Error('缺少幂等键'), { status: 400, code: 'INVALID_INPUT', expose: true });
    }

    getVehicleOrThrow(vin, user.id);

    // 1) 幂等：同一把钥匙只执行一次，返回原结果，不重复下发
    const dup = db.prepare('SELECT * FROM commands WHERE vin = ? AND idem_key = ?').get(vin, idemKey);
    if (dup) return { duplicate: true, command: toDto(dup) };

    // 2) 客户端时间偏移：防止重放被延迟利用
    const clientTs = Number(input?.clientTs ?? now);
    if (Math.abs(now - clientTs) > MAX_CLOCK_SKEW) {
      const rec = insert({ vin, type, params, status: 'REJECTED', idemKey, user, now,
        failCode: 'TIMESTAMP_SKEW', failReason: REJECT_REASONS.TIMESTAMP_SKEW });
      audit({ actor: user.id, action: 'command.rejected', vin, payload: { type, code: 'TIMESTAMP_SKEW' }, ...meta });
      return { command: toDto(rec) };
    }

    // 3) 车况前置校验
    const st = getState(vin, user.id);
    const cap = getGateway(db.prepare('SELECT gateway_kind g FROM vehicles WHERE vin=?').get(vin).g)
      .capabilities(vin);

    if (!cap.controllable.includes(type)) {
      return reject(vin, type, user, idemKey, 'NOT_SUPPORTED', now, meta);
    }
    if (!st.online) {
      return reject(vin, type, user, idemKey, 'VEHICLE_OFFLINE', now, meta);
    }
    for (const rule of SAFETY_RULES) {
      if (rule.types.includes(type) && rule.test(st)) {
        return reject(vin, type, user, idemKey, rule.code, now, meta);
      }
    }

    // 4) 受理 → PENDING
    const rec = insert({ vin, type, params, status: 'PENDING', idemKey, user, now });
    audit({ actor: user.id, action: 'command.issued', vin, payload: { id: rec.id, type, params }, ...meta });
    emit(vin, rec);

    // 5) 下发（异步）：先 SENT，等车端结论
    const gw = getGateway(db.prepare('SELECT gateway_kind g FROM vehicles WHERE vin=?').get(vin).g);
    setImmediate(async () => {
      update(rec.id, { status: 'SENT' });
      emit(vin, { ...rec, status: 'SENT' });

      try {
        const res = await gw.sendCommand(vin, { type, params, idempotencyKey: idemKey, issuedBy: user.id });
        const done = update(rec.id, res.ok
          ? { status: 'ACKED', acked_at: Date.now() }
          : { status: 'FAILED', fail_code: res.code, fail_reason: res.reason, acked_at: Date.now() });
        clearTimer(rec.id);
        emit(vin, done);
        audit({
          actor: user.id,
          action: res.ok ? 'command.acked' : 'command.failed',
          vin,
          payload: { id: rec.id, type, code: res.code },
          ...meta,
        });
      } catch (err) {
        const done = update(rec.id, { status: 'FAILED', fail_code: 'GATEWAY_ERROR', fail_reason: err.message });
        clearTimer(rec.id);
        emit(vin, done);
      }
    });

    // 6) TTL：30 秒没结论就作废，不允许延迟生效
    const t = setTimeout(() => {
      const cur = db.prepare('SELECT * FROM commands WHERE id = ?').get(rec.id);
      if (cur && (cur.status === 'PENDING' || cur.status === 'SENT')) {
        const expired = update(rec.id, { status: 'EXPIRED', fail_code: 'TTL' });
        emit(vin, expired);
        audit({ actor: user.id, action: 'command.expired', vin, payload: { id: rec.id, type } });
      }
      timers.delete(rec.id);
    }, TTL);
    t.unref?.();
    timers.set(rec.id, t);

    return { command: toDto(rec) };
  }

  function reject(vin, type, user, idemKey, code, now, meta) {
    const rec = insert({
      vin, type, params: {}, status: 'REJECTED', idemKey, user, now,
      failCode: code, failReason: REJECT_REASONS[code] || '已拦截',
    });
    audit({ actor: user.id, action: 'command.rejected', vin, payload: { id: rec.id, type, code }, ...meta });
    emit(vin, rec);
    return { command: toDto(rec) };
  }

  function insert({ vin, type, params, status, idemKey, user, now, failCode, failReason }) {
    const id = `cmd_${randomUUID().slice(0, 8)}`;
    // UNIQUE(vin, idem_key) 兜住并发下双击产生的重复
    try {
      db.prepare(
        `INSERT INTO commands (id, vin, type, params, status, idem_key, issued_by, created_at, fail_code, fail_reason)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).run(id, vin, type, JSON.stringify(params), status, idemKey, user.id, now, failCode ?? null, failReason ?? null);
    } catch {
      const existing = db.prepare('SELECT * FROM commands WHERE vin = ? AND idem_key = ?').get(vin, idemKey);
      if (existing) return existing;
      throw new Error('指令写入失败');
    }
    return db.prepare('SELECT * FROM commands WHERE id = ?').get(id);
  }

  function update(id, patch) {
    const keys = Object.keys(patch);
    const sql = `UPDATE commands SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...keys.map((k) => patch[k]), id);
    return db.prepare('SELECT * FROM commands WHERE id = ?').get(id);
  }

  function emit(vin, row) {
    bus.publish(vin, 'command.status', toDto(row));
  }

  function clearTimer(id) {
    const t = timers.get(id);
    if (t) { clearTimeout(t); timers.delete(id); }
  }

  function getById(vin, id, user) {
    getVehicleOrThrow(vin, user.id);
    const row = db.prepare('SELECT * FROM commands WHERE id = ? AND vin = ?').get(id, vin);
    return row ? toDto(row) : null;
  }

  function list(vin, user, limit = 30) {
    getVehicleOrThrow(vin, user.id);
    return db.prepare('SELECT * FROM commands WHERE vin = ? ORDER BY created_at DESC LIMIT ?')
      .all(vin, limit).map(toDto);
  }

  /** 进程重启后，把状态卡在中间态的指令清理掉 */
  function sweep() {
    const cutoff = Date.now() - TTL;
    const rows = db.prepare(
      "SELECT id, vin, type, issued_by FROM commands WHERE status IN ('PENDING','SENT') AND created_at < ?"
    ).all(cutoff);
    for (const r of rows) {
      const done = update(r.id, { status: 'EXPIRED', fail_code: 'TTL' });
      emit(r.vin, done);
    }
    return rows.length;
  }

  const sweeper = setInterval(sweep, 10_000);
  sweeper.unref?.();

  return { issue, getById, list, sweep };
}

function toDto(r) {
  return {
    id: r.id,
    vin: r.vin,
    type: r.type,
    params: safeParse(r.params),
    status: r.status,
    issuedBy: r.issued_by,
    createdAt: r.created_at,
    ackedAt: r.acked_at,
    failCode: r.fail_code,
    failReason: r.fail_reason ?? (r.fail_code ? REJECT_REASONS[r.fail_code] ?? null : null),
  };
}

function safeParse(s) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}
