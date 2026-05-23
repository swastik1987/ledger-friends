interface Props {
  active: 'expenses' | 'dashboard' | 'settings';
  onChange: (tab: 'expenses' | 'dashboard' | 'settings') => void;
}

const TABS: { id: Props['active']; label: string }[] = [
  { id: 'expenses', label: 'Transactions' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'settings', label: 'Settings' },
];

export default function TrackerTabBar({ active, onChange }: Props) {
  return (
    <div
      className="sticky z-10 px-4 pt-2 pb-2 bg-background/95 backdrop-blur-md"
      // TrackerTopBar publishes its measured height to --tracker-topbar-h on
      // <html>; we fall back to the historical 57px while it's still mounting.
      style={{ top: 'var(--tracker-topbar-h, 57px)' }}
    >
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-surface-alt border border-line">
        {TABS.map(t => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className="py-2 rounded-xl text-[13px] font-semibold transition-colors"
              style={{
                background: isActive ? 'hsl(var(--ink))' : 'transparent',
                color: isActive ? 'hsl(var(--background))' : 'hsl(var(--ink-soft))',
                letterSpacing: '-0.01em',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
