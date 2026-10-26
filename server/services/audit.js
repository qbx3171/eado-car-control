import { db } from '../db.js';

/** 审计：所有涉车动作都留痕，只增不改 */
export function audit({ actor, action, vin = null, payload = null, ip = null, ua = null }) {
  db.prepare(
    'INSERT INTO audit_logs (actor, action, vin, payload, ip, ua, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(actor, action, vin, payload ? JSON.stringify(payload) : null, ip, ua, Date.now());
}

export function listAudit(limit = 50) {
  return db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limit)
    .map((r) => ({
      id: r.id,
      actor: r.actor,
      action: r.action,
      vin: r.vin,
      payload: r.payload ? JSON.parse(r.payload) : null,
      at: r.created_at,
    }));
}
