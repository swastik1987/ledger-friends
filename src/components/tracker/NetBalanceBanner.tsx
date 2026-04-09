import { ArrowUpRight, ArrowDownLeft, Equal } from 'lucide-react';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';
import { Expense } from '@/types';
import { formatAmountShort } from '@/lib/currencies';

interface Props {
  expenses: Expense[];
  monthLabel: string;
  activeFilter: TransactionFilter;
  currencyCode: string;
}

export default function NetBalanceBanner({ expenses, monthLabel, activeFilter, currencyCode }: Props) {
  // Exclude transfers from totals to avoid double-counting
  const nonTransfers = expenses.filter(e => !e.is_transfer);
  const debits = nonTransfers.filter(e => e.is_debit);
  const credits = nonTransfers.filter(e => !e.is_debit);
  const totalOut = debits.reduce((s, e) => s + e.amount, 0);
  const totalIn = credits.reduce((s, e) => s + e.amount, 0);
  const net = totalOut - totalIn;

  return (
    <div className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-border">
        {/* Total Out */}
        <div className={`p-3 ${activeFilter === 'debit' ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
          <div className="flex items-center gap-1 mb-1">
            <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
            <span className="text-xs text-red-600 font-medium">Total Out</span>
          </div>
          <p className="font-mono text-sm font-bold text-red-600">{formatAmountShort(totalOut, currencyCode)}</p>
          <p className="text-[10px] text-muted-foreground">{debits.length} debit{debits.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Total In */}
        <div className={`p-3 ${activeFilter === 'credit' ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}`}>
          <div className="flex items-center gap-1 mb-1">
            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-600 font-medium">Total In</span>
          </div>
          <p className="font-mono text-sm font-bold text-emerald-600">{formatAmountShort(totalIn, currencyCode)}</p>
          <p className="text-[10px] text-muted-foreground">{credits.length} credit{credits.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Net Balance */}
        <div className={`p-3 ${activeFilter === 'all' ? 'bg-muted/50' : ''}`}>
          <div className="flex items-center gap-1 mb-1">
            <Equal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Net</span>
          </div>
          <p className={`font-mono text-sm font-bold ${net <= 0 ? 'text-emerald-600' : 'text-foreground'}`}>
            {net < 0 ? '+' : ''}{formatAmountShort(Math.abs(net), currencyCode)}
          </p>
          <p className="text-[10px] text-muted-foreground">{monthLabel}</p>
        </div>
      </div>
    </div>
  );
}
