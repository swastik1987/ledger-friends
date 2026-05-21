import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';

interface Props {
  value: TransactionFilter;
  onChange: (v: TransactionFilter) => void;
}

const OPTIONS: { id: TransactionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'debit', label: 'Out' },
  { id: 'credit', label: 'In' },
];

export default function TypeSegment({ value, onChange }: Props) {
  return (
    <div className="mx-4 mb-3 flex gap-1.5 p-1 rounded-xl bg-surface-alt border border-line-soft">
      {OPTIONS.map(o => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className="flex-1 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors"
            style={{
              background: active ? 'hsl(var(--card))' : 'transparent',
              color: active ? 'hsl(var(--ink))' : 'hsl(var(--ink-soft))',
              boxShadow: active ? '0 1px 0 hsl(var(--line))' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
