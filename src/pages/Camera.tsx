import { useCallback, useEffect, useRef, useState } from 'react';
import type { Snapshot, VehicleState } from '../types';
import { api } from '../api';
import CarTopView from '../CarTopView';
import { Icon360, IconCamera } from '../icons';
import { relTime } from '../labels';

const CH_ORDER = ['front', 'right', 'rear', 'left'] as const;
const CH_CN: Record<string, string> = { front: '前视', right: '右视', rear: '后视', left: '左视' };

type Phase = 'idle' | 'waking' | 'uploading' | 'stitching' | 'done' | 'error';

/**
 * 360° 环视影像页：四路鱼眼 → 拼合鸟瞰 + 单通道大图 + 历史相册。
 * 鸟瞰用 CSS 梯形裁切拼合（与真车 360 全景的呈现方式一致），不是装饰图。
 */
export default function Camera({
  vin,
  state,
  snapshots,
  onChanged,
}: {
  vin: string;
  state: VehicleState | null;
  snapshots: Snapshot[];
  onChanged: (items: Snapshot[]) => void;
}) {
  const [currentId, setCurrentId] = useState<string | null>(snapshots[0]?.id ?? null);
  const [mode, setMode] = useState<'bird' | 'single'>('bird');
  const [channel, setChannel] = useState<(typeof CH_ORDER)[number]>('front');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loadingImg, setLoadingImg] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [phaseText, setPhaseText] = useState('');
  const [error, setError] = useState('');

  const current = snapshots.find((s) => s.id === currentId) ?? snapshots[0] ?? null;
  const urlsRef = useRef<Record<string, string>>({});

  // blob URL 用完必须 revoke，否则 WebView 内存会被图片吃光
  const revokeAll = useCallback(() => {
    for (const u of Object.values(urlsRef.current)) URL.revokeObjectURL(u);
    urlsRef.current = {};
  }, []);

  useEffect(() => revokeAll, [revokeAll]);

  // 加载当前快照的四帧
  useEffect(() => {
    if (!current) {
      setLoadingImg(false);
      return;
    }
    let alive = true;
    setLoadingImg(true);
    setError('');

    (async () => {
      try {
        const got: Record<string, string> = {};
        for (const ch of CH_ORDER) {
          if (current.channels.some((c) => c.ch === ch)) {
            got[ch] = await api.fetchFrame(vin, current.id, ch);
          }
        }
        if (!alive) {
          for (const u of Object.values(got)) URL.revokeObjectURL(u);
          return;
        }
        revokeAll();
        urlsRef.current = got;
        setUrls(got);
        setLoadingImg(false);
      } catch {
        if (alive) {
          setLoadingImg(false);
          setError('图片加载失败，请重试或重新拍摄');
        }
      }
    })();

    return () => { alive = false; };
  }, [current?.id, vin, revokeAll]);

  const capture = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'done' && phase !== 'error') return;
    setError('');
    setPhase('waking');
    setPhaseText('正在唤醒 T-Box 与摄像头…');

    const t1 = setTimeout(() => phase === 'waking' && setPhaseText('摄像头已上线，正在曝光…'), 1200);
    const t2 = setTimeout(() => {
      setPhase('uploading');
      setPhaseText('图传回传中，四路同时上传…');
    }, 2100);
    const t3 = setTimeout(() => {
      setPhase('stitching');
      setPhaseText('拼接环视鸟瞰图…');
    }, 3300);

    try {
      const r = await api.captureSnapshot(vin);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);

      if (!r.ok || !r.snapshot) {
        setPhase('error');
        setError(r.reason || '拍摄失败，请稍后再试');
        return;
      }
      setPhase('done');
      setPhaseText(`拍摄完成 · 耗时 ${((r.elapsedMs ?? 0) / 1000).toFixed(1)}s`);
      onChanged([r.snapshot, ...snapshots].slice(0, 12));
      setCurrentId(r.snapshot.id);
      setTimeout(() => setPhase('idle'), 3600);
    } catch (e) {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      setPhase('error');
      setError(e instanceof Error ? e.message : '网络异常');
    }
  }, [vin, phase, snapshots, onChanged]);

  const capturing = phase === 'waking' || phase === 'uploading' || phase === 'stitching';
  const offline = state?.online === false;
  const speeding = (state?.speed ?? 0) > 15;
  const disabled = offline || speeding || capturing || !state;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <span className="card-title-strong">
            <Icon360 width={16} height={16} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--mint)' }} />
            360° 环视影像
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {offline ? '车辆离线' : speeding ? '车速过高' : '四路鱼眼 · 远程拍照'}
          </span>
        </div>

        {/* 拍照主按钮 */}
        <button className={`cam-capture ${disabled ? 'is-disabled' : ''}`} onClick={capture} disabled={disabled}>
          {capturing ? (
            <>
              <span className="toast-spin" style={{ width: 18, height: 18, borderWidth: 2.4 }} />
              <span className="cam-capture-text">{phaseText}</span>
            </>
          ) : (
            <>
              <IconCamera width={19} height={19} />
              <span className="cam-capture-text">{phaseText || '远程拍照'}</span>
            </>
          )}
        </button>

        {phase === 'done' && <div className="cam-phase ok">{phaseText}</div>}
        {error && <div className="cam-phase err">{error}</div>}

        {!current && !capturing && (
          <div className="cam-empty">
            <Icon360 width={30} height={30} />
            <p>还没有照片。点上方「远程拍照」，<br />车辆会启动四路环视摄像头回传画面。</p>
          </div>
        )}

        {current && (
          <>
            {/* 视图切换 */}
            <div className="seg" style={{ margin: '14px 18px 0' }}>
              <button className={mode === 'bird' ? 'active' : ''} onClick={() => setMode('bird')}>环视鸟瞰</button>
              <button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>单通道</button>
            </div>

            {mode === 'bird' ? (
              <BirdView
                urls={urls}
                loading={loadingImg}
                state={state}
                capturedAt={current.capturedAt}
              />
            ) : (
              <div className="cam-single">
                <div className="cam-channel-tabs">
                  {CH_ORDER.map((ch) => (
                    <button
                      key={ch}
                      className={channel === ch ? 'active' : ''}
                      disabled={!urls[ch]}
                      onClick={() => setChannel(ch)}
                    >
                      {CH_CN[ch]}
                    </button>
                  ))}
                </div>
                <div className="cam-frame">
                  {loadingImg && <div className="cam-skeleton" />}
                  {!loadingImg && urls[channel] && (
                    <img src={urls[channel]} alt={`${CH_CN[channel]}环视画面`} />
                  )}
                  <span className="cam-stamp num">{CH_CN[channel]} · {fmtTime(current.capturedAt)}</span>
                </div>
                <a
                  className="cam-dl"
                  href={urls[channel]}
                  download={`eado-360-${current.id}-${channel}.png`}
                  style={{ pointerEvents: urls[channel] ? 'auto' : 'none', opacity: urls[channel] ? 1 : 0.4 }}
                >
                  保存该帧图片
                </a>
              </div>
            )}
          </>
        )}
      </div>

      {snapshots.length > 0 && (
        <div className="card">
          <div className="card-head">
            <span className="card-title">历史照片</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>保留最近 12 次</span>
          </div>
          <div className="cam-list">
            {snapshots.map((s) => (
              <button
                key={s.id}
                className={`cam-item ${s.id === current?.id ? 'active' : ''}`}
                onClick={() => setCurrentId(s.id)}
              >
                <span className="cam-item-time num">{fmtTime(s.capturedAt)}</span>
                <span className="cam-item-sub">
                  {relTime(s.capturedAt)} · {s.channels.length} 路 · {(s.channels.reduce((n, c) => n + c.bytes, 0) / 1024).toFixed(0)} KB
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** 四路梯形拼合鸟瞰：中间叠实时车辆俯视图 */
function BirdView({
  urls,
  loading,
  state,
  capturedAt,
}: {
  urls: Record<string, string>;
  loading: boolean;
  state: VehicleState | null;
  capturedAt: number;
}) {
  return (
    <div className="cam-bird">
      <div className="cam-bird-stage">
        {/* 前 / 右 / 后 / 左：梯形裁切，模拟鱼眼投到地面的拼合区 */}
        {(['front', 'right', 'rear', 'left'] as const).map((ch, i) => (
          <div key={ch} className={`cam-quad q${i}`}>
            <div className="cam-quad-rot">
              {urls[ch] && <img src={urls[ch]} alt="" draggable={false} />}
            </div>
            <span className="cam-quad-label">{CH_CN[ch]}</span>
          </div>
        ))}

        {/* 中心车辆：实时状态（车门/车窗变化直接可见） */}
        <div className="cam-car">
          {state ? <CarTopView state={state} /> : null}
        </div>

        {loading && <div className="cam-skeleton bird" />}
      </div>
      <div className="cam-bird-foot num">
        拼合于 {fmtTime(capturedAt)} · 中心为实时车况俯视图
      </div>
    </div>
  );
}

function fmtTime(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
