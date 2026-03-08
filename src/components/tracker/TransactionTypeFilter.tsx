import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';

interface Props {
  value: TransactionFilter;
  onChange: (v: TransactionFilter) => void;
}

export default function TransactionTypeFilter({ value, onChange }: Props) {
  const options: { key: TransactionFilter; label: string; icon?: React.ReactNode; activeClass: string }[] = [
    { key: 'all', label: 'All', activeClass: 'text-primary' },
    { key: 'debit', label: 'Debit', icon: <ArrowUpRight className="h-3.5 w-3.5" />, activeClass: 'text-red-600' },
    { key: 'credit', label: 'Credit', icon: <ArrowDownLeft className="h-3.5 w-3.5" />, activeClass: 'text-emerald-600' },
  ];

  return (
    <div className="flex rounded-xl bg-muted p-1">
      {options.map(opt => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-sm font-medium rounded-lg transition-all ${
              active
                ? `bg-card shadow-sm ${opt.activeClass} font-semibold`
                : 'text-muted-foreground'
            }`}
          >
            {active && opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
