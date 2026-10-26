import { useEffect, useState } from 'react';
import type { Capabilities, CommandRecord, Vehicle, VehicleState } from '../types';
import { api } from '../api';
import { COMMAND_DEFS } from '../../shared/contract.js';
import { CommandStatusText, relTime } from '../labels';
import { IconLogout, IconShield, IconWifi, IconWifiOff, IconGauge } from '../icons';

export default function Profile({
  vehicle,
  state,
  capabilities,
  user,
  onLogout,
  onChanged,
}: {
  vehicle: Vehicle;
  state: VehicleState | null;
  capabilities: Capabilities | null;
  user: { phone: string; name: string };
  onLogout: () => void;
  onChanged: (s: VehicleState) => void;
}) {
  const [speed, setSpeed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<CommandRecord[]>([]);

  useEffect(() => {
    let alive = true;
    api.commands(vehicle.vin)
      .then((r) => alive && setLogs(r.items.slice(0, 8)))
      .catch(() => {});
    return () => { alive = false; };
  }, [vehicle.vin, state?.capturedAt === 0]);

  const isMock = vehicle.gateway === 'mock';

  async function apply(patch: Record<string, unknown>) {
    setBusy(true);
    try {
      const s = await api.simulate(vehicle.vin, patch);
      onChanged(s);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* 账号 */}
      <div className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 15, flexShrink: 0,
            background: 'linear-gradient(145deg,#3d84ff,#1448a8)',
            display: 'grid', placeItems: 'center', fontSize: 19, fontWeight: 650, color: '#fff',
          }}
        >
          {user.name.slice(0, 1)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650 }}>{user.name}</div>
          <div className="num" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
          </div>
        </div>
        <button className="icon-btn" onClick={onLogout} title="退出登录">
          <IconLogout width={17} height={17} />
        </button>
      </div>

      {/* 车辆信息 */}
      <div className="card">
        <div className="card-head"><span className="card-title-strong">车辆信息</span></div>
        <div style={{ padding: '8px 0 6px' }}>
          <Row label="车型" value={vehicle.model} />
          <Row label="车牌" value={vehicle.plate} />
          <Row label="VIN" value={vehicle.vin} mono />
          <Row label="数据网关" value={`${vehicle.gateway}${isMock ? '（模拟）' : ''}`} />
          <Row
            label="支持能力"
            value={`${capabilities?.controllable.length ?? 0} 项控制 / ${capabilities?.readable.length ?? 0} 项读取`}
          />
        </div>
      </div>

      {/* 演示控制台 */}
      {isMock && (
        <div className="card">
          <div className="card-head">
            <span className="card-title-strong">模拟控制台</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>仅 Mock 网关</span>
          </div>
          <div style={{ padding: '12px 18px 18px' }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 14 }}>
              把车速拉起来，再回「车辆」页点解锁——你会看到指令被安全规则拦截。
              这是本项目最该被验证的一条路径。
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconGauge width={14} height={14} /> 车速
              </span>
              <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{speed} km/h</span>
            </div>
            <input
              type="range"
              min={0}
              max={120}
              step={10}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div className="seg" style={{ marginTop: 10 }}>
              {[0, 60, 120].map((v) => (
                <button key={v} onClick={() => setSpeed(v)} className={speed === v ? 'active' : ''}>
                  {v === 0 ? '静止' : `${v} km/h`}
                </button>
              ))}
              <button
                onClick={() => apply({ speed })}
                disabled={busy}
                className="active"
                style={{ marginLeft: 'auto' }}
              >
                应用
              </button>
            </div>

            <div style={{ height: 1, background: 'var(--line)', margin: '18px 0' }} />

            <div className="setting-row" style={{ padding: '0 0 12px' }}>
              <div>
                <div className="setting-label" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {state?.online !== false ? <IconWifi width={14} height={14} /> : <IconWifiOff width={14} height={14} />}
                  车辆在线
                </div>
                <div className="setting-desc">关闭后模拟 T-Box 失联，所有指令应被拦截</div>
              </div>
              <button
                className={`switch ${state?.online !== false ? 'on' : ''}`}
                onClick={() => apply({ online: state?.online === false })}
                disabled={busy}
                aria-label="切换在线状态"
              />
            </div>

            <div className="seg">
              <button onClick={() => apply({ fuelLevel: 62.4 })} disabled={busy}>油量 62%</button>
              <button onClick={() => apply({ fuelLevel: 3 })} disabled={busy}>油量 3%（触发低油量拦截）</button>
            </div>
          </div>
        </div>
      )}

      {/* 指令历史 */}
      <div className="card">
        <div className="card-head">
          <span className="card-title-strong">指令记录</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>最近 8 条</span>
        </div>
        {logs.length === 0 ? (
          <div className="empty">暂无指令记录</div>
        ) : (
          <div style={{ marginTop: 8 }}>
            {logs.map((c) => (
              <div className="log-row" key={c.id}>
                <span className="log-type">{COMMAND_DEFS[c.type]?.label ?? c.type}</span>
                <span className={`badge ${c.status}`}>{CommandStatusText[c.status]}</span>
                {c.failReason && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.failReason}
                  </span>
                )}
                <span className="log-time num">{relTime(c.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex', gap: 9, alignItems: 'flex-start',
          padding: '13px 15px', borderRadius: 14,
          background: 'rgba(0,214,163,.06)', border: '1px solid rgba(0,214,163,.14)',
          fontSize: 11.5, color: '#6fdcc0', lineHeight: 1.6,
        }}
      >
        <IconShield width={15} height={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          当前数据来自本地模拟网关，不连接任何车厂服务器。接入真实车辆需走车厂授权，
          详见项目 README 的「三条路」。
        </span>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 18px', fontSize: 12.5 }}>
      <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{label}</span>
      <span className={mono ? 'num' : ''} style={{ textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
