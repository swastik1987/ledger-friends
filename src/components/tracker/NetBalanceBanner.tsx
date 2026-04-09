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
    <div className="rounded-2xl gradient-banner shadow-lg overflow-hidden animate-fade-in-up">
      <div className="grid grid-cols-3 divide-x divide-white/10">
        {/* Total Out */}
        <div className={`p-3 transition-colors ${activeFilter === 'debit' ? 'bg-white/10' : ''}`}>
          <div className="flex items-center gap-1 mb-1">
            <ArrowUpRight className="h-3.5 w-3.5 text-red-300" />
            <span className="text-xs text-red-200 font-medium">Total Out</span>
          </div>
          <p className="font-mono text-sm font-bold text-white">{formatAmountShort(totalOut, currencyCode)}</p>
          <p className="text-[10px] text-indigo-200/70">{debits.length} debit{debits.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Total In */}
        <div className={`p-3 transition-colors ${activeFilter === 'credit' ? 'bg-white/10' : ''}`}>
          <div className="flex items-center gap-1 mb-1">
            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-300" />
            <span className="text-xs text-emerald-200 font-medium">Total In</span>
          </div>
          <p className="font-mono text-sm font-bold text-white">{formatAmountShort(totalIn, currencyCode)}</p>
          <p className="text-[10px] text-indigo-200/70">{credits.length} credit{credits.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Net Balance */}
        <div className={`p-3 transition-colors ${activeFilter === 'all' ? 'bg-white/10' : ''}`}>
          <div className="flex items-center gap-1 mb-1">
            <Equal className="h-3.5 w-3.5 text-indigo-200" />
            <span className="text-xs text-indigo-200 font-medium">Net</span>
          </div>
          <p className={`font-mono text-sm font-bold ${net <= 0 ? 'text-emerald-300' : 'text-white'}`}>
            {net < 0 ? '+' : ''}{formatAmountShort(Math.abs(net), currencyCode)}
          </p>
          <p className="text-[10px] text-indigo-200/70">{monthLabel}</p>
        </div>
      </div>
    </div>
  );
}
