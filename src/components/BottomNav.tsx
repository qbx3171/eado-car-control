import { IconHome, IconCamera, IconRoute, IconBell, IconUser } from '../icons';

export type Tab = 'home' | 'camera' | 'trips' | 'alerts' | 'profile';

const ITEMS: { key: Tab; label: string; Icon: typeof IconHome }[] = [
  { key: 'home', label: '车辆', Icon: IconHome },
  { key: 'camera', label: '全景', Icon: IconCamera },
  { key: 'trips', label: '行程', Icon: IconRoute },
  { key: 'alerts', label: '提醒', Icon: IconBell },
  { key: 'profile', label: '我的', Icon: IconUser },
];

export default function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map(({ key, label, Icon }) => (
        <button
          key={key}
          className={`nav-item ${tab === key ? 'active' : ''}`}
          onClick={() => onChange(key)}
        >
          <Icon />
          {label}
        </button>
      ))}
    </nav>
  );
}

export { ITEMS as NAV_ITEMS };
