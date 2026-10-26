import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlertItem, Capabilities, CommandRecord, Snapshot, Stats, Vehicle, VehicleState } from './types';
import { api, connectWs, tokenStore, ApiError } from './api';
import { COMMAND_DEFS } from '../shared/contract.js';
import Login from './components/Login';
import HeroCard from './components/HeroCard';
import BottomNav, { NAV_ITEMS, type Tab } from './components/BottomNav';
import ConfirmDialog from './components/ConfirmDialog';
import ToastHost, { type ToastItem } from './components/ToastHost';
import Home from './pages/Home';
import Camera from './pages/Camera';
import Trips from './pages/Trips';
import Alerts from './pages/Alerts';
import Profile from './pages/Profile';
import { IconCar, IconRefresh, IconChevronRight } from './icons';

const NAME_KEY = 'eado.name';

export default function App() {
  const [logged, setLogged] = useState(!!tokenStore.get());
  const [name, setName] = useState(localStorage.getItem(NAME_KEY) || '车主');

  // token 过期 / 被服务端拒绝时，自动退回登录页
  useEffect(() => {
    const onUnauthorized = () => {
      localStorage.removeItem(NAME_KEY);
      setLogged(false);
    };
    window.addEventListener('eado:unauthorized', onUnauthorized);
    return () => window.removeEventListener('eado:unauthorized', onUnauthorized);
  }, []);

  if (!logged) {
    return (
      <Login
        onSuccess={(n) => {
          localStorage.setItem(NAME_KEY, n);
          setName(n);
          setLogged(true);
        }}
      />
    );
  }

  return (
    <Shell
      userName={name}
      onLogout={() => {
        tokenStore.clear();
        localStorage.removeItem(NAME_KEY);
        setLogged(false);
      }}
    />
  );
}

type ConfirmState = { type: string; params?: Record<string, unknown> } | null;

function Shell({ userName, onLogout }: { userName: string; onLogout: () => void }) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [state, setState] = useState<VehicleState | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  const [tab, setTab] = useState<Tab>('home');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [busyType, setBusyType] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [fatal, setFatal] = useState('');
  const [loading, setLoading] = useState(true);

  const timers = useRef(new Map<string, number>());

  const upsertToast = useCallback((item: ToastItem) => {
    setToasts((ts) => {
      const i = ts.findIndex((t) => t.id === item.id);
      if (i === -1) return [...ts, item].slice(-3);
      const next = [...ts];
      next[i] = item;
      return next;
    });
  }, []);

  const dismissLater = useCallback((id: string, ms: number) => {
    const prev = timers.current.get(id);
    if (prev) window.clearTimeout(prev);
    const t = window.setTimeout(() => {
      setToasts((ts) => ts.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, ms);
    timers.current.set(id, t);
  }, []);

  // ── 初始化 ────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    (async () => {
      const { items } = await api.vehicles();
      if (!items.length) throw new ApiError(404, 'NO_VEHICLE', '账号下未绑定车辆');
      const v = items[0];
      if (!alive) return;
      setVehicle(v);

      const [s, c, st, al] = await Promise.all([
        api.state(v.vin), api.capabilities(v.vin), api.stats(v.vin), api.alerts(v.vin),
      ]);
      if (!alive) return;
      setState(s);
      setCaps(c);
      setStats(st);
      setAlerts(al.items);

      // 拍照历史失败不阻塞主流程
      api.snapshots(v.vin).then((r) => alive && setSnapshots(r.items)).catch(() => {});
    })()
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) { onLogout(); return; }
        setFatal(e instanceof ApiError ? e.message : '加载失败，请检查服务是否启动');
      })
      .finally(() => alive && setLoading(false));

    return () => { alive = false; };
  }, [onLogout]);

  // ── 实时通道 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!vehicle) return;
    return connectWs(vehicle.vin, (e) => {
      if (e.type === 'vehicle.state') {
        setState(e.payload);
      } else if (e.type === 'command.status') {
        const cmd = e.payload as CommandRecord;
        upsertToast({
          id: cmd.id,
          type: cmd.type,
          status: cmd.status,
          note: cmd.failReason ?? undefined,
        });
        if (cmd.status !== 'PENDING' && cmd.status !== 'SENT') {
          setBusyType(null);
          dismissLater(cmd.id, cmd.status === 'ACKED' ? 2600 : 5200);
        }
      } else if (e.type === 'snapshot.ready') {
        // 拍照完成由 WS 推送兜底：即使 REST 响应丢了，相册也会更新
        const snap = e.payload;
        setSnapshots((prev) => (prev.some((s) => s.id === snap.id) ? prev : [snap, ...prev].slice(0, 12)));
      }
    });
  }, [vehicle, upsertToast, dismissLater]);

  const refresh = useCallback(async () => {
    if (!vehicle) return;
    const [s, st, al] = await Promise.all([
      api.state(vehicle.vin), api.stats(vehicle.vin), api.alerts(vehicle.vin),
    ]);
    setState(s);
    setStats(st);
    setAlerts(al.items);
  }, [vehicle]);

  // ── 指令下发 ──────────────────────────────────────────────────────
  const run = useCallback(async (type: string, params: Record<string, unknown> = {}) => {
    if (!vehicle) return;
    setBusyType(type);

    try {
      const r = await api.issueCommand(vehicle.vin, type, params);
      const cmd = r.command;

      upsertToast({
        id: cmd.id,
        type: cmd.type,
        status: cmd.status,
        note: cmd.status === 'REJECTED' ? cmd.failReason ?? '已被安全规则拦截' : undefined,
      });

      if (cmd.status === 'REJECTED' || cmd.status === 'FAILED') {
        setBusyType(null);
        dismissLater(cmd.id, 5200);
      } else {
        // 兜底：万一 WS 断了，别让用户一直看着转圈
        dismissLater(cmd.id, 15_000);
      }
    } catch (e) {
      setBusyType(null);
      const msg = e instanceof ApiError ? e.message : '网络异常';
      upsertToast({ id: `err_${Date.now()}`, type, status: 'FAILED', note: msg });
      dismissLater(`err_${Date.now()}`, 4000);
    }
  }, [vehicle, upsertToast, dismissLater]);

  const execute = useCallback((type: string, params?: Record<string, unknown>) => {
    const def = COMMAND_DEFS[type];
    if (!def) return;
    if (def.risk === 'high') { setConfirm({ type, params }); return; }
    run(type, params);
  }, [run]);

  if (fatal) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div className="dialog-title">无法加载车辆</div>
          <div className="dialog-desc" style={{ marginTop: 10 }}>{fatal}</div>
          <button className="login-btn" style={{ marginTop: 22 }} onClick={() => location.reload()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (loading || !vehicle) {
    return (
      <div className="login-wrap">
        <div style={{ display: 'grid', placeItems: 'center', gap: 16, color: 'var(--text-3)' }}>
          <div className="toast-spin" style={{ width: 26, height: 26, borderWidth: 2.5 }} />
          <span style={{ fontSize: 13 }}>正在连接车辆…</span>
        </div>
      </div>
    );
  }

  const confirmDef = confirm ? COMMAND_DEFS[confirm.type] : null;

  return (
    <>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <IconCar width={20} height={20} color="#fff" />
            </div>
            <div>
              <div className="brand-name">逸动PLUS 车辆管家</div>
              <div className="brand-sub">车云控制台 · {vehicle.plate}</div>
            </div>
          </div>

          <div className="top-actions">
            <div className="tabs desktop-tabs">
              {NAV_ITEMS.map(({ key, label }) => (
                <button
                  key={key}
                  className={`tab ${tab === key ? 'active' : ''}`}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="icon-btn" onClick={refresh} title="刷新车况">
              <IconRefresh width={17} height={17} />
            </button>
          </div>
        </header>

        <div className="layout">
          <div className="col-left">
            <HeroCard vehicle={vehicle} state={state} />
            <button
              className="card card-pad"
              style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', color: 'inherit' }}
              onClick={() => setTab('profile')}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>数据网关</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>
                  {vehicle.gateway === 'mock' ? '本地模拟网关' : vehicle.gateway === 'obd' ? 'OBD-II 只读网关' : '车厂授权网关'}
                </div>
              </div>
              <IconChevronRight width={16} height={16} style={{ color: 'var(--text-3)' }} />
            </button>
          </div>

          <div className="col-right">
            {tab === 'home' && (
              <Home
                state={state}
                capabilities={caps}
                stats={stats}
                alerts={alerts}
                busyType={busyType}
                onExecute={execute}
                onGoAlerts={() => setTab('alerts')}
                onGoCamera={() => setTab('camera')}
              />
            )}
            {tab === 'camera' && (
              <Camera
                vin={vehicle.vin}
                state={state}
                snapshots={snapshots}
                onChanged={setSnapshots}
              />
            )}
            {tab === 'trips' && <Trips vin={vehicle.vin} stats={stats} />}
            {tab === 'alerts' && <Alerts vin={vehicle.vin} items={alerts} onChange={refresh} />}
            {tab === 'profile' && (
              <Profile
                vehicle={vehicle}
                state={state}
                capabilities={caps}
                user={{ name: userName, phone: '13800138000' }}
                onLogout={onLogout}
                onChanged={(s) => setState(s)}
              />
            )}
          </div>
        </div>
      </div>

      <BottomNav tab={tab} onChange={setTab} />
      <ToastHost items={toasts} />

      {confirm && confirmDef && (
        <ConfirmDialog
          title={confirmDef.label}
          desc={confirmDef.confirm}
          warn={
            confirmDef.risk === 'high'
              ? '该操作会改变车辆安全状态，请确认车辆周边环境安全、车内无儿童或宠物后再执行。'
              : undefined
          }
          danger={confirm.type === 'UNLOCK' || confirm.type === 'TRUNK_OPEN'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const t = confirm.type;
            const p = confirm.params;
            setConfirm(null);
            run(t, p);
          }}
        />
      )}
    </>
  );
}
