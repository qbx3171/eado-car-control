import type { Vehicle, VehicleState } from '../types';
import CarTopView from '../CarTopView';
import { IconLock, IconUnlock } from '../icons';

export default function HeroCard({ vehicle, state }: { vehicle: Vehicle; state: VehicleState | null }) {
  const locked = state?.locked !== false;
  const online = state?.online !== false;
  const fuel = state?.fuel?.level ?? null;
  const fuelColor = fuel === null ? 'var(--text-3)' : fuel > 30 ? 'var(--mint)' : fuel > 15 ? 'var(--warn)' : 'var(--danger)';

  return (
    <div className="card hero">
      <div className="hero-top">
        <div style={{ minWidth: 0 }}>
          <div className="plate">
            <span className={`online-dot ${online ? '' : 'off'}`} />
            {vehicle.plate}
          </div>
          <div className="hero-model">
            {vehicle.model}
            <small>VIN {vehicle.vin.slice(-8)} · 网关 {vehicle.gateway}</small>
          </div>
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px', borderRadius: 10,
            background: locked ? 'rgba(0,214,163,.1)' : 'rgba(255,176,32,.12)',
            border: `1px solid ${locked ? 'rgba(0,214,163,.22)' : 'rgba(255,176,32,.25)'}`,
            color: locked ? 'var(--mint)' : 'var(--warn)',
            fontSize: 11.5, fontWeight: 600, flexShrink: 0,
          }}
        >
          {locked ? <IconLock width={13} height={13} /> : <IconUnlock width={13} height={13} />}
          {locked ? '已锁车' : '已解锁'}
        </div>
      </div>

      {state ? <CarTopView state={state} /> : <div className="car-stage" />}

      <div style={{ padding: '0 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>燃油余量</span>
          <span className="num" style={{ fontSize: 12.5, fontWeight: 600, color: fuelColor }}>
            {fuel === null ? '—' : `${fuel.toFixed(1)}%`}
          </span>
        </div>
        <div className="bar">
          <div
            className="bar-fill"
            style={{ width: `${fuel ?? 0}%`, background: `linear-gradient(90deg, ${fuelColor}, ${fuelColor}aa)` }}
          />
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-label">续航</div>
            <div className="hero-stat-value num">
              {state?.fuel?.rangeKm ?? '—'}<span>km</span>
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">总里程</div>
            <div className="hero-stat-value num">
              {state?.odometer != null ? Math.round(state.odometer).toLocaleString() : '—'}<span>km</span>
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">车内温度</div>
            <div className="hero-stat-value num">
              {state?.climate?.cabinTemp != null ? state.climate.cabinTemp.toFixed(1) : '—'}<span>°C</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
