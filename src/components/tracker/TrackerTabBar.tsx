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
    <div className="mx-4 mb-3 mt-1 grid grid-cols-3 gap-1 p-1 rounded-2xl bg-surface-alt border border-line">
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
  );
}
