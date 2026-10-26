import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  width: 24, height: 24, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  ...props,
});

export const IconLock = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const IconUnlock = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const IconTrunk = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 15h18" />
    <path d="M5 15V9.5a2 2 0 0 1 .6-1.4L8 5.7A2 2 0 0 1 9.4 5h5.2a2 2 0 0 1 1.4.6l2.4 2.4a2 2 0 0 1 .6 1.4V15" />
    <path d="M9 15v3M15 15v3" />
  </svg>
);

export const IconEngine = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 9h6l3 3h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
    <path d="M7 9v9H5a1 1 0 0 1-1-1v-4" />
    <path d="M9 6h4v3" />
    <path d="M12 15h3" />
  </svg>
);

export const IconEngineOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 9h6l3 3h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" />
    <path d="M7 9v9H5a1 1 0 0 1-1-1v-4" />
    <path d="M9 6h4v3" />
    <path d="M4 3l17 18" stroke="currentColor" />
  </svg>
);

export const IconAc = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
    <path d="M12 7l2-2M12 7l-2-2M12 17l2 2M12 17l-2 2" />
  </svg>
);

export const IconAcOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v6M12 15v6M4.2 7.5l5.2 3M14.6 13.5l5.2 3M19.8 7.5l-5.2 3M9.4 13.5l-5.2 3" />
    <path d="M4 3l17 18" />
  </svg>
);

export const IconWindow = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M12 5v14M4 12h16" />
    <path d="M7 17.5l1.5 1.5" />
  </svg>
);

/** 开窗：窗框 + 玻璃下降箭头 */
export const IconWindowOpen = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 10h16" />
    <path d="M12 12.5v5M9.2 15l2.8 2.8 2.8-2.8" />
  </svg>
);

/** 通风：气流线 */
export const IconVent = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 8h10.5a2.8 2.8 0 1 0-2.8-2.8" />
    <path d="M3 12.5h14a2.8 2.8 0 1 1-2.8 2.8" />
    <path d="M3 17h7" />
  </svg>
);

/** 鸣笛：喇叭 + 声波 */
export const IconHorn = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 10v4a1 1 0 0 0 1 1h2.6l4.4 3.4V5.6L7.6 9H5a1 1 0 0 0-1 1Z" />
    <path d="M16.5 9a4.2 4.2 0 0 1 0 6" />
    <path d="M19 6.5a8 8 0 0 1 0 11" />
  </svg>
);

export const IconFind = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="11" r="3" />
    <path d="M12 21s7-5.3 7-10a7 7 0 1 0-14 0c0 4.7 7 10 7 10Z" />
  </svg>
);

export const IconHome = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z" />
    <path d="M9.5 20.5v-6h5v6" />
  </svg>
);

export const IconRoute = (p: P) => (
  <svg {...base(p)}>
    <circle cx="6" cy="6" r="2.2" />
    <circle cx="18" cy="18" r="2.2" />
    <path d="M8.2 6H14a3.5 3.5 0 0 1 0 7h-4a3.5 3.5 0 0 0 0 7h5.8" />
  </svg>
);

export const IconBell = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </svg>
);

export const IconUser = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" />
  </svg>
);

export const IconChevronRight = (p: P) => (
  <svg {...base(p)}><path d="m9 5 7 7-7 7" /></svg>
);

export const IconChevronDown = (p: P) => (
  <svg {...base(p)}><path d="m5 9 7 7 7-7" /></svg>
);

export const IconRefresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 5v6h-6" />
  </svg>
);

export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4.5 3 19.5h18L12 4.5Z" />
    <path d="M12 10v4.2" />
    <circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconInfo = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8" r=".9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconShield = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5 5 6.5v5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9v-5l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const IconWifi = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9.5a12 12 0 0 1 16 0" />
    <path d="M7 13a8 8 0 0 1 10 0" />
    <path d="M10 16.5a4 4 0 0 1 4 0" />
    <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconWifiOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9.5a12 12 0 0 1 5-2.8M15 7a12 12 0 0 1 5 2.5" />
    <path d="M7 13a8 8 0 0 1 3-1.7M14 11.4a8 8 0 0 1 3 1.6" />
    <path d="M3 3l18 18" />
  </svg>
);

export const IconLogout = (p: P) => (
  <svg {...base(p)}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </svg>
);

export const IconCar = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 16.5V12l1.8-4.2A2 2 0 0 1 8.6 6.5h6.8a2 2 0 0 1 1.8 1.3L19 12v4.5" />
    <path d="M3.5 12h17" />
    <circle cx="7.5" cy="16.5" r="1.8" />
    <circle cx="16.5" cy="16.5" r="1.8" />
  </svg>
);

export const IconClock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);

export const IconFlash = (p: P) => (
  <svg {...base(p)}><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" /></svg>
);

export const IconTire = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3.5v5.3M12 15.2v5.3M3.5 12h5.3M15.2 12h5.3" />
  </svg>
);

export const IconBattery = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="8" width="16" height="9" rx="2" />
    <path d="M21 11v3" />
    <path d="M6.5 11v3M9.5 11v3" />
  </svg>
);

export const IconFuel = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 20V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v15" />
    <path d="M3.5 20h11" />
    <path d="M13 9h3.5a2 2 0 0 1 2 2v5a1.8 1.8 0 0 0 3.6 0V9.5L18.5 6" />
  </svg>
);

export const IconGauge = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 18a8.5 8.5 0 1 1 16 0" />
    <path d="m12 14 4-4" />
    <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconCamera = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6a2 2 0 0 0 1.7-1l.4-.7a1.6 1.6 0 0 1 1.4-.8h1.8a1.6 1.6 0 0 1 1.4.8l.4.7a2 2 0 0 0 1.7 1h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5Z" />
    <circle cx="12" cy="12.5" r="3.4" />
    <circle cx="12" cy="12.5" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const Icon360 = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.6" strokeDasharray="3.2 2.4" />
    <path d="M9.6 10.2a2.5 2.5 0 1 1 2.4 3.4c-1.3 0-2.4.7-2.4 2.2V17h5" />
  </svg>
);
