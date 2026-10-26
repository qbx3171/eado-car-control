import type { AlertItem } from '../types';
import { api } from '../api';
import { IconAlert, IconInfo, IconShield } from '../icons';
import { relTime } from '../labels';

export default function Alerts({
  vin,
  items,
  onChange,
}: {
  vin: string;
  items: AlertItem[];
  onChange: () => void;
}) {
  const open = items.filter((a) => !a.resolved);
  const done = items.filter((a) => a.resolved);

  async function resolve(id: string) {
    await api.resolveAlert(vin, id);
    onChange();
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <span className="card-title-strong">待处理提醒</span>
          <span style={{ fontSize: 11, color: open.length ? 'var(--warn)' : 'var(--mint)' }}>
            {open.length} 条
          </span>
        </div>

        {open.length === 0 ? (
          <div className="empty">
            <IconShield width={30} height={30} style={{ color: 'var(--mint)' }} />
            <div>车辆状态良好，没有待处理的提醒</div>
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {open.map((a) => (
              <div className="alert-item" key={a.id}>
                <div className={`alert-icon ${a.level}`}>
                  {a.level === 'info' ? <IconInfo width={17} height={17} /> : <IconAlert width={17} height={17} />}
                </div>
                <div className="alert-body">
                  <div className="alert-title">{a.title}</div>
                  <div className="alert-detail">{a.detail}</div>
                  <div className="alert-time">
                    {relTime(a.createdAt)}
                    <button
                      onClick={() => resolve(a.id)}
                      style={{ marginLeft: 12, color: 'var(--accent)', fontSize: 11 }}
                    >
                      标记已处理
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {done.length > 0 && (
        <div className="card">
          <div className="card-head">
            <span className="card-title">已处理</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{done.length} 条</span>
          </div>
          <div style={{ marginTop: 10, opacity: 0.6 }}>
            {done.map((a) => (
              <div className="alert-item" key={a.id}>
                <div className="alert-icon info">
                  <IconShield width={17} height={17} />
                </div>
                <div className="alert-body">
                  <div className="alert-title">{a.title}</div>
                  <div className="alert-time">{relTime(a.createdAt)} · 已处理</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
