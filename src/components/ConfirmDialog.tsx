import { IconAlert } from '../icons';

export default function ConfirmDialog({
  title,
  desc,
  warn,
  confirmText = '确认执行',
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  desc: string;
  warn?: string;
  confirmText?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="dialog-title">{title}</div>
        <div className="dialog-desc">{desc}</div>

        {warn && (
          <div className="dialog-warn">
            <IconAlert width={13} height={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {warn}
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onCancel}>取消</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
