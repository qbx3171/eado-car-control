import type { CommandStatus } from '../types';
import { COMMAND_DEFS } from '../../shared/contract.js';
import { CommandStatusText } from '../labels';

export interface ToastItem {
  id: string;
  type: string;
  status: CommandStatus;
  note?: string;
}

export default function ToastHost({ items }: { items: ToastItem[] }) {
  if (!items.length) return null;

  return (
    <div className="toast-wrap">
      {items.map((t) => {
        const def = COMMAND_DEFS[t.type];
        const busy = t.status === 'PENDING' || t.status === 'SENT';
        return (
          <div className="toast" key={t.id}>
            {busy ? (
              <span className="toast-spin" />
            ) : (
              <span
                style={{
                  width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                  background: t.status === 'ACKED' ? 'rgba(0,214,163,.18)' : 'rgba(255,90,95,.18)',
                  color: t.status === 'ACKED' ? 'var(--mint)' : 'var(--danger)',
                  fontSize: 11, fontWeight: 700,
                }}
              >
                {t.status === 'ACKED' ? '✓' : '!'}
              </span>
            )}
            <div className="toast-text">
              <div className="toast-title">
                {def?.label ?? t.type} · {CommandStatusText[t.status] ?? t.status}
              </div>
              {t.note && <div className="toast-sub">{t.note}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
