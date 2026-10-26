import { useEffect, useState } from 'react';
import { api, tokenStore, ApiError } from '../api';
import { IconCar, IconShield } from '../icons';
import {
  getServerUrl, setServerUrl, normalizeServerUrl, probeServer, isNativeApp,
} from '../serverConfig';

export default function Login({ onSuccess }: { onSuccess: (name: string) => void }) {
  const [phone, setPhone] = useState('13800138000');
  const [code, setCode] = useState('');
  const [hint, setHint] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // 服务器地址：APP 里必须能改，Web 同源时隐藏
  const [showServer] = useState(isNativeApp() || !!getServerUrl());
  const [editing, setEditing] = useState(isNativeApp() && !getServerUrl());
  const [serverInput, setServerInput] = useState(getServerUrl());
  const [savedServer, setSavedServer] = useState(getServerUrl());
  const [probe, setProbe] = useState<{ ok: boolean; message: string } | null>(null);
  const [probing, setProbing] = useState(false);

  const phoneOk = /^1[3-9]\d{9}$/.test(phone);

  // APP 首次启动且没配地址时自动展开，避免用户对着"登录失败"无从下手
  useEffect(() => {
    if (isNativeApp() && !getServerUrl()) setEditing(true);
  }, []);

  async function testAndSave() {
    const norm = normalizeServerUrl(serverInput);
    setProbing(true);
    setProbe(null);
    const r = await probeServer(norm);
    setProbe(r);
    setProbing(false);
    if (r.ok) {
      setServerUrl(norm);
      setSavedServer(norm);
      setServerInput(norm);
      setErr('');
      // 地址换了，旧 token 指向旧服务，清掉更安全
      tokenStore.clear();
    }
  }

  async function sendCode() {
    if (!phoneOk) return setErr('手机号格式不正确');
    setErr('');
    try {
      const r = await api.sendCode(phone);
      setHint(r.hint);
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(timer); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '发送失败');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const r = await api.login(phone, code);
      tokenStore.set(r.token);
      onSuccess(r.user.name);
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message);
      } else if (isNativeApp() && !getServerUrl()) {
        // 这一类失败几乎都是没配服务器，直接把话说明白
        setErr('连不上服务器：请先点上方「未设置服务器地址」填写电脑地址');
        setEditing(true);
      } else {
        setErr('登录失败：检查网络、服务器是否已启动');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <IconCar width={26} height={26} color="#fff" />
        </div>

        <h1 className="login-title">车辆管家</h1>
        <p className="login-sub">
          长安逸动PLUS · 车况监控与远程控制
          <br />
          登录后即可查看你的车辆
        </p>

        {showServer && (
          <div className="server-box">
            <button
              type="button"
              className="server-toggle"
              onClick={() => setEditing((v) => !v)}
            >
              <span className={`srv-dot ${savedServer ? 'on' : ''}`} />
              <span className="srv-text">
                {savedServer ? savedServer.replace(/^https?:\/\//, '') : '未设置服务器地址'}
              </span>
              <span className="srv-action">{editing ? '收起' : '设置'}</span>
            </button>

            {editing && (
              <div className="server-panel">
                <div className="srv-hint">
                  填写运行后端的那台电脑地址，手机需与电脑连同一个 WiFi
                </div>
                <div className="code-row">
                  <input
                    className="input num"
                    value={serverInput}
                    onChange={(e) => { setServerInput(e.target.value); setProbe(null); }}
                    placeholder="192.168.1.5:8787"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  <button
                    type="button"
                    className="code-btn"
                    onClick={testAndSave}
                    disabled={probing || !serverInput.trim()}
                  >
                    {probing ? '测试中' : '连接'}
                  </button>
                </div>
                {probe && (
                  <div className={`srv-probe ${probe.ok ? 'ok' : 'bad'}`}>{probe.message}</div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="field">
          <div className="field-label">手机号</div>
          <input
            className="input num"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="请输入手机号"
            inputMode="numeric"
            autoComplete="tel"
          />
        </div>

        <div className="field">
          <div className="field-label">短信验证码</div>
          <div className="code-row">
            <input
              className="input num"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 位验证码"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
            <button
              type="button"
              className="code-btn"
              onClick={sendCode}
              disabled={!phoneOk || countdown > 0}
            >
              {countdown > 0 ? `${countdown}s` : '获取验证码'}
            </button>
          </div>
        </div>

        {hint && <div className="login-hint">{hint}</div>}
        {err && <div className="form-error">{err}</div>}

        <button className="login-btn" type="submit" disabled={!phoneOk || code.length < 6 || loading}>
          {loading ? '登录中…' : '登录'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 20, color: 'var(--text-3)', fontSize: 11 }}>
          <IconShield width={14} height={14} />
          所有控车操作均经过身份校验并记录审计日志
        </div>
      </form>
    </div>
  );
}
