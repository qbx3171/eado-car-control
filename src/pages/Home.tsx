import { useEffect, useRef, useState } from 'react';
import type { AlertItem, Capabilities, Stats, VehicleState } from '../types';
import CommandGrid from '../components/CommandGrid';
import { IconAlert, IconBattery, IconTire, IconGauge, IconFuel, IconChevronRight, Icon360 } from '../icons';
import { relTime } from '../labels';

export default function Home({
  state,
  capabilities,
  stats,
  alerts,
  busyType,
  onExecute,
  onGoAlerts,
  onGoCamera,
}: {
  state: VehicleState | null;
  capabilities: Capabilities | null;
  stats: Stats | null;
  alerts: AlertItem[];
  busyType: string | null;
  onExecute: (type: string, params?: Record<string, unknown>) => void;
  onGoAlerts: () => void;
  onGoCamera: () => void;
}) {
  const offline = state?.online === false;
  const openAlert = alerts.find((a) => !a.resolved);

  // 空调设定温度：首次从车况同步，之后以用户调整为准（否则 WS 推送会把用户的选择冲掉）
  const [targetTemp, setTargetTemp] = useState(24);
  const tempSynced = useRef(false);
  const serverTemp = state?.climate?.targetTemp ?? null;
  useEffect(() => {
    if (tempSynced.current || serverTemp == null) return;
    setTargetTemp(serverTemp);
    tempSynced.current = true;
  }, [serverTemp]);

  const acOn = state?.climate?.on === true;
  const cabinTemp = state?.climate?.cabinTemp ?? null;
  const tire = state?.tirePressure;
  const tireMin = tire ? Math.min(tire.fl, tire.fr, tire.rl, tire.rr) : null;
  const tireLowName = tire
    ? (['fl', 'fr', 'rl', 'rr'] as const).reduce((a, b) => (tire[a] <= tire[b] ? a : b))
    : null;
  const TIRE_CN = { fl: '左前', fr: '右前', rl: '左后', rr: '右后' } as const;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {openAlert && (
        <div className="alert-strip">
          <span className="dot" />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {openAlert.title}
          </span>
          <button onClick={onGoAlerts} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            查看 <IconChevronRight width={12} height={12} />
          </button>
        </div>
      )}

      {offline && (
        <div className="alert-strip" style={{ background: 'rgba(255,90,95,.1)', borderColor: 'rgba(255,90,95,.25)', color: '#ff8b8f' }}>
          <IconAlert width={14} height={14} />
          <span style={{ flex: 1 }}>车辆已离线，所有远程控制已禁用</span>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <span className="card-title-strong">远程控制</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {offline ? '车辆离线' : '指令以车端回执为准'}
          </span>
        </div>
        {/* 空调温控：先设温度，再点「空调」下发，避免"开了但不知道几度" */}
        <div className="climate-bar">
          <div className="climate-left">
            <span className="climate-title">
              空调{acOn ? <b className="on">运行中</b> : <b className="off">已关闭</b>}
            </span>
            <span className="climate-sub num">
              车内 {cabinTemp != null ? `${cabinTemp.toFixed(1)}°C` : '—'}
              {acOn ? ` · 目标 ${targetTemp}°C` : ''}
            </span>
          </div>
          <div className="climate-ctrl">
            <button
              className="temp-btn"
              onClick={() => setTargetTemp((t) => Math.max(16, t - 1))}
              disabled={targetTemp <= 16}
              aria-label="降低温度"
            >
              −
            </button>
            <span className="temp-val num">{targetTemp}<small>°C</small></span>
            <button
              className="temp-btn"
              onClick={() => setTargetTemp((t) => Math.min(30, t + 1))}
              disabled={targetTemp >= 30}
              aria-label="升高温度"
            >
              +
            </button>
          </div>
        </div>

        <CommandGrid
          controllable={capabilities?.controllable ?? []}
          offline={offline}
          busyType={busyType}
          targetTemp={targetTemp}
          onExecute={onExecute}
        />
      </div>

      {/* 360 环视入口：拍照是独立能力，不该埋在九宫格里 */}
      <button className="cam-entry" onClick={onGoCamera}>
        <Icon360 width={20} height={20} />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>360° 环视影像</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            远程启动四路摄像头拍照，查看车辆四周
          </div>
        </div>
        <IconChevronRight width={15} height={15} style={{ color: 'var(--text-3)' }} />
      </button>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-top">
            <span className="stat-label">胎压（最低）</span>
            <IconTire width={15} height={15} style={{ color: 'var(--text-3)' }} />
          </div>
          <div className="stat-value num">
            {tireMin != null ? tireMin.toFixed(2) : '—'}<small>bar</small>
          </div>
          <div className="stat-foot" style={{ color: tireMin != null && tireMin < 2.3 ? 'var(--warn)' : 'var(--text-3)' }}>
            {tireMin == null ? '该网关不支持' : tireMin < 2.3 ? `${TIRE_CN[tireLowName!]}偏低，建议补气` : '四轮胎压正常'}
          </div>
        </div>

        <div className="stat">
          <div className="stat-top">
            <span className="stat-label">电瓶电压</span>
            <IconBattery width={15} height={15} style={{ color: 'var(--text-3)' }} />
          </div>
          <div className="stat-value num">
            {state?.battery?.voltage != null ? state.battery.voltage.toFixed(2) : '—'}<small>V</small>
          </div>
          <div className="stat-foot" style={{ color: state?.battery?.voltage && state.battery.voltage < 12 ? 'var(--warn)' : 'var(--text-3)' }}>
            {state?.engineOn ? '发电机供电中' : state?.battery?.voltage && state.battery.voltage < 12 ? '电压偏低，注意亏电' : '电瓶状态正常'}
          </div>
        </div>

        <div className="stat">
          <div className="stat-top">
            <span className="stat-label">今日里程</span>
            <IconGauge width={15} height={15} style={{ color: 'var(--text-3)' }} />
          </div>
          <div className="stat-value num">
            {stats?.today.distanceKm ?? state?.today?.distanceKm ?? '—'}<small>km</small>
          </div>
          <div className="stat-foot">
            {stats?.today.trips ?? state?.today?.trips ?? 0} 段行程 · 均速 {stats?.today.avgSpeed ?? 0} km/h
          </div>
        </div>

        <div className="stat">
          <div className="stat-top">
            <span className="stat-label">本周油耗</span>
            <IconFuel width={15} height={15} style={{ color: 'var(--text-3)' }} />
          </div>
          <div className="stat-value num">
            {stats?.week.per100km ?? '—'}<small>L/100km</small>
          </div>
          <div className="stat-foot" style={{ color: 'var(--mint)' }}>
            驾驶评分 {stats?.week.drivingScore ?? '—'} 分
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">本周概览</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>近 7 天</span>
        </div>
        <div style={{ padding: '10px 0 6px' }}>
          <Row label="行驶里程" value={`${stats?.week.distanceKm ?? 0} km`} />
          <Row label="行程次数" value={`${stats?.week.trips ?? 0} 次`} />
          <Row label="燃油消耗" value={`${stats?.week.fuelL ?? 0} L`} />
          <Row
            label="急加速 / 急刹"
            value={`${stats?.week.hardAccel ?? 0} / ${stats?.week.hardBrake ?? 0} 次`}
            valueColor={stats && stats.week.hardBrake > 2 ? 'var(--warn)' : undefined}
          />
        </div>
      </div>

      {openAlert && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
          最近提醒：{openAlert.title} · {relTime(openAlert.createdAt)}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 18px', fontSize: 13 }}>
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span className="num" style={{ fontWeight: 600, color: valueColor }}>{value}</span>
    </div>
  );
}
