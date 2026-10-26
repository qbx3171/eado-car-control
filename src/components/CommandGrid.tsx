import type { FC, SVGProps } from 'react';
import { COMMAND_DEFS } from '../../shared/contract.js';
import {
  IconLock, IconUnlock, IconTrunk, IconEngine, IconEngineOff,
  IconAc, IconAcOff, IconWindow, IconWindowOpen, IconVent, IconHorn, IconFind, IconCar,
} from '../icons';

const ICONS: Record<string, FC<SVGProps<SVGSVGElement>>> = {
  lock: IconLock,
  unlock: IconUnlock,
  trunk: IconTrunk,
  engine: IconEngine,
  'engine-off': IconEngineOff,
  ac: IconAc,
  'ac-off': IconAcOff,
  window: IconWindow,
  'window-open': IconWindowOpen,
  vent: IconVent,
  horn: IconHorn,
  find: IconFind,
};

/**
 * 3×4 布局，按「安全 → 动力 → 空调 → 车窗/寻车」分行。
 * 同一行内正反操作相邻（开/关并排），误触时手不会跳到对角。
 */
const ORDER = [
  'LOCK', 'UNLOCK', 'TRUNK_OPEN',
  'ENGINE_START', 'ENGINE_STOP', 'HORN',
  'AC_ON', 'AC_OFF', 'FIND_CAR',
  'WINDOW_OPEN', 'WINDOW_VENT', 'WINDOW_CLOSE',
];

export default function CommandGrid({
  controllable,
  offline,
  busyType,
  targetTemp,
  onExecute,
}: {
  controllable: string[];
  offline: boolean;
  busyType: string | null;
  /** 空调设定温度，随「开空调」指令一起下发 */
  targetTemp?: number;
  onExecute: (type: string, params?: Record<string, unknown>) => void;
}) {
  return (
    <div className="cmd-grid">
      {ORDER.map((type) => {
        const def = COMMAND_DEFS[type];
        if (!def) return null;
        const Icon = ICONS[def.icon] ?? IconCar;
        const unsupported = !controllable.includes(type);
        const busy = busyType === type;

        return (
          <button
            key={type}
            className={`cmd-btn ${busy ? 'is-busy' : ''}`}
            disabled={offline || unsupported || busyType !== null}
            onClick={() =>
              onExecute(type, type === 'AC_ON' && targetTemp ? { targetTemp } : undefined)
            }
            title={unsupported ? '当前车辆不支持该功能' : def.label}
          >
            <Icon />
            <span className="cmd-label">{def.short}</span>
            {type === 'AC_ON' && targetTemp ? (
              <span className="cmd-sub num">{targetTemp}°</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
