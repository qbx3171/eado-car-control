import type { VehicleState } from './types';

/**
 * 车辆俯视图。控车类产品的核心不是按钮，是"我现在看到车是什么状态"。
 * 车门开合、车窗开度、后备箱、大灯寻车，全部映射到这张图上。
 */
export default function CarTopView({ state }: { state: VehicleState }) {
  const locked = state.locked !== false;
  const doors = state.doors ?? { fl: false, fr: false, rl: false, rr: false, trunk: false };
  const w = state.windows ?? { fl: 0, fr: 0, rl: 0, rr: 0 };
  const flashing = !!state.flashedAt && Date.now() - state.flashedAt < 3200;

  const doorLine = (open: boolean, x: number, y1: number, y2: number, dir: 1 | -1) => (
    <g
      className="door"
      style={{
        transform: `rotate(${open ? dir * 22 : 0}deg)`,
        transformOrigin: `${x}px ${y1}px`,
      }}
    >
      <path
        className={`door-line ${open ? 'door-open' : ''}`}
        d={`M${x},${y1} L${x},${y2}`}
      />
    </g>
  );

  const glass = (open: number) => ({
    fill: open > 0 ? 'rgba(0,214,163,.42)' : 'rgba(120,160,220,.15)',
  });

  return (
    <div className="car-stage">
      <svg
        className={`car-svg ${locked ? 'car-locked' : ''}`}
        viewBox="0 0 168 246"
        role="img"
        aria-label={`车辆状态：${locked ? '已锁定' : '已解锁'}`}
      >
        <defs>
          <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#26303f" />
            <stop offset="52%" stopColor="#1a222e" />
            <stop offset="100%" stopColor="#121822" />
          </linearGradient>
          <linearGradient id="roofGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d2634" />
            <stop offset="100%" stopColor="#151c26" />
          </linearGradient>
          <radialGradient id="shadowGrad">
            <stop offset="0%" stopColor="rgba(47,123,255,.30)" />
            <stop offset="100%" stopColor="rgba(47,123,255,0)" />
          </radialGradient>
        </defs>

        {/* 地面光晕 */}
        <ellipse cx="84" cy="128" rx="86" ry="118" fill="url(#shadowGrad)" />

        {/* 轮胎 */}
        <rect className="wheel" x="23" y="56" width="11" height="34" rx="5" />
        <rect className="wheel" x="134" y="56" width="11" height="34" rx="5" />
        <rect className="wheel" x="23" y="174" width="11" height="34" rx="5" />
        <rect className="wheel" x="134" y="174" width="11" height="34" rx="5" />

        {/* 后视镜 */}
        <rect x="27" y="84" width="7" height="13" rx="3" fill="#1a2230" stroke="rgba(255,255,255,.1)" />
        <rect x="134" y="84" width="7" height="13" rx="3" fill="#1a2230" stroke="rgba(255,255,255,.1)" />

        {/* 车身 */}
        <rect className="car-body" x="34" y="10" width="100" height="228" rx="36" />

        {/* 前挡风 */}
        <path className="glass" style={glass(0)} d="M50,56 L118,56 L126,86 L42,86 Z" opacity=".9" />
        {/* 车顶 */}
        <rect x="42" y="86" width="84" height="64" rx="5" fill="url(#roofGrad)" stroke="rgba(255,255,255,.06)" />
        {/* 后挡风 */}
        <path className="glass" style={glass(0)} d="M42,150 L126,150 L118,180 L50,180 Z" opacity=".9" />

        {/* 侧窗 */}
        <rect className="glass" x="36" y="90" width="5.5" height="26" rx="2.5" style={glass(w.fl)} />
        <rect className="glass" x="36" y="120" width="5.5" height="26" rx="2.5" style={glass(w.rl)} />
        <rect className="glass" x="126.5" y="90" width="5.5" height="26" rx="2.5" style={glass(w.fr)} />
        <rect className="glass" x="126.5" y="120" width="5.5" height="26" rx="2.5" style={glass(w.rr)} />

        {/* 座椅：让俯视图有内饰层次，不是一块铁皮 */}
        <rect x="58" y="92" width="20" height="28" rx="7" fill="#0f151d" stroke="rgba(255,255,255,.05)" />
        <rect x="90" y="92" width="20" height="28" rx="7" fill="#0f151d" stroke="rgba(255,255,255,.05)" />
        <rect x="56" y="132" width="56" height="19" rx="7" fill="#0f151d" stroke="rgba(255,255,255,.05)" />
        <rect x="81" y="92" width="6" height="28" rx="2" fill="#0b1017" />

        {/* 车门 */}
        {doorLine(doors.fl, 35, 88, 118, -1)}
        {doorLine(doors.fr, 133, 88, 118, 1)}
        {doorLine(doors.rl, 35, 122, 152, -1)}
        {doorLine(doors.rr, 133, 122, 152, 1)}

        {/* 后备箱 */}
        <g
          className="door"
          style={{
            transform: `translateY(${doors.trunk ? -9 : 0}px)`,
            transformOrigin: '84px 186px',
          }}
        >
          <path
            className={`door-line ${doors.trunk ? 'door-open' : ''}`}
            d="M48,186 L120,186"
          />
        </g>

        {/* 大灯 / 尾灯 */}
        <rect className={`lamp ${flashing ? 'flash-ring' : ''}`} x="46" y="13" width="16" height="5.5" rx="2.7" />
        <rect className={`lamp ${flashing ? 'flash-ring' : ''}`} x="106" y="13" width="16" height="5.5" rx="2.7" />
        <rect x="46" y="230" width="16" height="4.5" rx="2.2" fill="rgba(255,90,95,.4)" />
        <rect x="106" y="230" width="16" height="4.5" rx="2.2" fill="rgba(255,90,95,.4)" />

        {/* 车头标识 */}
        <circle cx="84" cy="26" r="4" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="1.2" />
      </svg>
    </div>
  );
}
