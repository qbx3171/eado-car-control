import { useEffect, useState } from 'react';
import type { Trip, Stats } from '../types';
import { api, ApiError } from '../api';
import { IconChevronRight, IconRoute, IconClock } from '../icons';
import { timeHM, dateMd, duration } from '../labels';

export default function Trips({ vin, stats }: { vin: string; stats: Stats | null }) {
  const [items, setItems] = useState<Trip[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api.trips(vin)
      .then((r) => alive && setItems(r.items))
      .catch((e) => alive && setErr(e instanceof ApiError ? e.message : '加载失败'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [vin]);

  async function toggle(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setDetail(null);
    try {
      const t = await api.trip(vin, id);
      setDetail(t);
    } catch { /* 展开失败保留列表态 */ }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat">
          <div className="stat-label">本周里程</div>
          <div className="stat-value num">{stats?.week.distanceKm ?? '—'}<small>km</small></div>
        </div>
        <div className="stat">
          <div className="stat-label">行程次数</div>
          <div className="stat-value num">{stats?.week.trips ?? '—'}<small>次</small></div>
        </div>
        <div className="stat">
          <div className="stat-label">百公里油耗</div>
          <div className="stat-value num">{stats?.week.per100km ?? '—'}<small>L</small></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title-strong">行程记录</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>最近 30 天</span>
        </div>

        {loading && <div className="empty">加载中…</div>}
        {err && <div className="empty">{err}</div>}
        {!loading && !err && items.length === 0 && (
          <div className="empty">
            <IconRoute width={30} height={30} />
            <div>还没有行程记录</div>
          </div>
        )}

        {items.length > 0 && (
          <div className="trip-list" style={{ margin: '12px 12px 12px' }}>
            {items.map((t) => {
              const d = dateMd(t.startAt);
              const open = openId === t.id;
              return (
                <div key={t.id}>
                  <button className="trip" onClick={() => toggle(t.id)}>
                    <div className="trip-date">
                      <b className="num">{d.day}</b>
                      {d.month}
                    </div>
                    <div className="trip-path">
                      <div className="trip-endpoints">
                        <span>{t.startAddr}</span>
                        <IconChevronRight width={12} height={12} className="arrow-dash" />
                        <span>{t.endAddr}</span>
                      </div>
                      <div className="trip-meta num">
                        <span>{timeHM(t.startAt)}–{timeHM(t.endAt)}</span>
                        <span><IconClock width={10} height={10} style={{ verticalAlign: -1 }} /> {duration(t.durationMin)}</span>
                      </div>
                    </div>
                    <div className="trip-km num">
                      <b>{t.distanceKm.toFixed(1)}</b><span> km</span>
                    </div>
                  </button>

                  {open && (
                    <div style={{ padding: '0 12px 12px' }}>
                      {detail?.id === t.id ? (
                        <>
                          <div className="track-box">
                            <TrackMap track={detail.track ?? []} />
                          </div>
                          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11.5, color: 'var(--text-3)' }}>
                            <span>均速 <b className="num" style={{ color: 'var(--text-2)' }}>{detail.avgSpeed}</b> km/h</span>
                            <span>最高 <b className="num" style={{ color: 'var(--text-2)' }}>{detail.maxSpeed}</b> km/h</span>
                            <span>油耗 <b className="num" style={{ color: 'var(--text-2)' }}>{detail.fuelL}</b> L</span>
                            <span style={{ marginLeft: 'auto', color: detail.hardBrake > 0 ? 'var(--warn)' : undefined }}>
                              急加速 {detail.hardAccel} · 急刹 {detail.hardBrake}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="empty" style={{ padding: 24 }}>加载轨迹…</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** 轨迹图：把经纬度归一化到画布，不引地图 SDK，离线也能看形状 */
function TrackMap({ track }: { track: { lat: number; lng: number }[] }) {
  if (track.length < 2) {
    return <div className="empty" style={{ padding: 30 }}>无轨迹数据</div>;
  }

  const W = 320, H = 150, PAD = 18;
  const lats = track.map((p) => p.lat);
  const lngs = track.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-4;
  const spanLng = maxLng - minLng || 1e-4;

  const pts = track.map((p) => ({
    // 纬度向上，故 1 - 
    x: PAD + ((p.lng - minLng) / spanLng) * (W - PAD * 2),
    y: PAD + (1 - (p.lat - minLat) / spanLat) * (H - PAD * 2),
  }));

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const start = pts[0], end = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="trackGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3d84ff" />
          <stop offset="100%" stopColor="#00d6a3" />
        </linearGradient>
      </defs>

      {/* 网格底纹，暗示地图但不假装是地图 */}
      {Array.from({ length: 5 }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={(H / 4) * i} x2={W} y2={(H / 4) * i} stroke="rgba(255,255,255,.035)" />
      ))}
      {Array.from({ length: 7 }).map((_, i) => (
        <line key={`v${i}`} x1={(W / 6) * i} y1="0" x2={(W / 6) * i} y2={H} stroke="rgba(255,255,255,.035)" />
      ))}

      <path d={d} fill="none" stroke="rgba(61,132,255,.22)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="url(#trackGrad)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

      <circle cx={start.x} cy={start.y} r="5" fill="#0a0f16" stroke="#3d84ff" strokeWidth="2.2" />
      <circle cx={end.x} cy={end.y} r="5" fill="#00d6a3" stroke="#0a0f16" strokeWidth="2" />
    </svg>
  );
}
