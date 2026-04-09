import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';

interface Props {
  value: TransactionFilter;
  onChange: (v: TransactionFilter) => void;
}

export default function TransactionTypeFilter({ value, onChange }: Props) {
  const options: { key: TransactionFilter; label: string; icon?: React.ReactNode; activeClass: string; activeBg: string }[] = [
    { key: 'all', label: 'All', activeClass: 'text-indigo-700 dark:text-indigo-300', activeBg: 'bg-indigo-50 dark:bg-indigo-950/40' },
    { key: 'debit', label: 'Debit', icon: <ArrowUpRight className="h-3.5 w-3.5" />, activeClass: 'text-red-600 dark:text-red-400', activeBg: 'bg-red-50 dark:bg-red-950/30' },
    { key: 'credit', label: 'Credit', icon: <ArrowDownLeft className="h-3.5 w-3.5" />, activeClass: 'text-emerald-600 dark:text-emerald-400', activeBg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  ];

  return (
    <div className="flex rounded-xl bg-muted/70 p-1">
      {options.map(opt => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              active
                ? `${opt.activeBg} shadow-sm ${opt.activeClass} font-semibold`
                : 'text-muted-foreground hover:text-foreground'
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
