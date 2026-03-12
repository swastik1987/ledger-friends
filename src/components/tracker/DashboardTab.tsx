import { Expense, Category } from '@/types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { subMonths, addMonths, format, parse } from 'date-fns';
import { BarChart2, ArrowUpRight, ArrowDownLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import TransactionTypeFilter from './TransactionTypeFilter';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';

function generateMonths() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = subMonths(now, i);
    months.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') });
  }
  return months;
}

interface Props {
  expenses: Expense[];
  categories: Category[];
  month: string;
  onMonthChange: (m: string) => void;
  isLoading: boolean;
  typeFilter: TransactionFilter;
  onTypeFilterChange: (v: TransactionFilter) => void;
}

export default function DashboardTab({ expenses, categories, month, onMonthChange, isLoading, typeFilter, onTypeFilterChange }: Props) {
  const months = generateMonths();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const debitExpenses = useMemo(() => expenses.filter(e => e.is_debit), [expenses]);
  const creditExpenses = useMemo(() => expenses.filter(e => !e.is_debit), [expenses]);
  const totalDebits = debitExpenses.reduce((s, e) => s + e.amount, 0);
  const totalCredits = creditExpenses.reduce((s, e) => s + e.amount, 0);

  const buildCategoryData = (exps: Expense[]) => {
    const map: Record<string, { category: Category; total: number; count: number }> = {};
    exps.forEach(e => {
      if (!map[e.category_id]) {
        map[e.category_id] = { category: e.category || categories.find(c => c.id === e.category_id)!, total: 0, count: 0 };
      }
      map[e.category_id].total += e.amount;
      map[e.category_id].count++;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  };

  const debitCategoryData = useMemo(() => buildCategoryData(debitExpenses), [debitExpenses, categories]);
  const creditCategoryData = useMemo(() => buildCategoryData(creditExpenses), [creditExpenses, categories]);

  // Filter-aware data
  const filteredExpenses = typeFilter === 'debit' ? debitExpenses : typeFilter === 'credit' ? creditExpenses : expenses;

  // Summary cards
  const summaryCards = useMemo(() => {
    if (typeFilter === 'debit') {
      const top = debitCategoryData[0];
      const largest = [...debitExpenses].sort((a, b) => b.amount - a.amount)[0];
      return [
        { label: 'Total Spent', value: `₹${totalDebits.toLocaleString('en-IN')}`, color: 'text-red-600' },
        { label: 'Transactions', value: String(debitExpenses.length) },
        { label: 'Largest Expense', value: largest ? `₹${largest.amount.toLocaleString('en-IN')}` : '-' },
        { label: 'Top Category', value: top ? `${top.category?.icon} ${top.category?.name}` : '-' },
      ];
    } else if (typeFilter === 'credit') {
      const top = creditCategoryData[0];
      const largest = [...creditExpenses].sort((a, b) => b.amount - a.amount)[0];
      return [
        { label: 'Total Received', value: `₹${totalCredits.toLocaleString('en-IN')}`, color: 'text-emerald-600' },
        { label: 'Transactions', value: String(creditExpenses.length) },
        { label: 'Largest Credit', value: largest ? `₹${largest.amount.toLocaleString('en-IN')}` : '-', color: 'text-emerald-600' },
        { label: 'Top Source', value: top ? `${top.category?.icon} ${top.category?.name}` : '-' },
      ];
    } else {
      const topSpend = debitCategoryData[0];
      const net = totalDebits - totalCredits;
      return [
        { label: 'Total Out', value: `₹${totalDebits.toLocaleString('en-IN')}`, color: 'text-red-600' },
        { label: 'Total In', value: `₹${totalCredits.toLocaleString('en-IN')}`, color: 'text-emerald-600' },
        { label: 'Net Balance', value: `${net < 0 ? '+' : ''}₹${Math.abs(net).toLocaleString('en-IN')}`, color: net <= 0 ? 'text-emerald-600' : '' },
        { label: 'Top Spend', value: topSpend ? `${topSpend.category?.icon} ${topSpend.category?.name}` : '-' },
      ];
    }
  }, [typeFilter, debitExpenses, creditExpenses, totalDebits, totalCredits, debitCategoryData, creditCategoryData]);

  // Category breakdown based on filter
  const breakdownData = useMemo(() => {
    if (typeFilter === 'debit') return debitCategoryData.map(d => ({ ...d, isDebit: true }));
    if (typeFilter === 'credit') return creditCategoryData.map(d => ({ ...d, isDebit: false }));
    // All: combine both
    const all = [
      ...debitCategoryData.map(d => ({ ...d, isDebit: true })),
      ...creditCategoryData.map(d => ({ ...d, isDebit: false })),
    ].sort((a, b) => b.total - a.total);
    return all;
  }, [typeFilter, debitCategoryData, creditCategoryData]);

  const breakdownTotal = breakdownData.reduce((s, d) => s + d.total, 0);

  // Top 5
  const top5 = useMemo(() => {
    if (typeFilter === 'credit') return [...creditExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
    return [...debitExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [typeFilter, debitExpenses, creditExpenses]);

  if (isLoading) {
    return (
      <div className="px-4 py-3 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl bg-card border border-border p-4 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => { const prev = format(subMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM'); if (months.some(m => m.value === prev)) onMonthChange(prev); }}
            disabled={month === months[months.length - 1]?.value}
            className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
          ><ChevronLeft className="h-5 w-5" /></button>
          <Select value={month} onValueChange={onMonthChange}>
            <SelectTrigger className="flex-1 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button
            onClick={() => { const next = format(addMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM'); if (months.some(m => m.value === next)) onMonthChange(next); }}
            disabled={month === months[0]?.value}
            className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
          ><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div className="text-center py-16">
          <BarChart2 className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <p className="font-semibold text-lg">No data for this month</p>
          <p className="text-sm text-muted-foreground">Add transactions to see your dashboard</p>
        </div>
      </div>
    );
  }

  const renderDonut = (data: { category: Category; total: number; count: number }[], total: number, label: string, title: string, emoji: string) => {
    const hasData = data.length > 0 && total > 0;
    return (
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-muted-foreground text-center mb-1">{emoji} {title}</p>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data.map(d => ({ name: d.category?.name, value: d.total, color: d.category?.color, icon: d.category?.icon, id: d.category?.id }))}
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={54}
                dataKey="value"
                onClick={(d) => setSelectedCategoryId(d.id === selectedCategoryId ? null : d.id)}
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.category?.color || '#ccc'} stroke="none" />
                ))}
                <Label
                  content={() => (
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                      <tspan x="50%" dy="-6" className="fill-foreground font-mono text-sm font-bold">
                        ₹{total.toLocaleString('en-IN')}
                      </tspan>
                      <tspan x="50%" dy="16" className="fill-muted-foreground text-[10px]">
                        {label}
                      </tspan>
                    </text>
                  )}
                />
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  const pct = ((d.value / total) * 100).toFixed(1);
                  return (
                    <div className="bg-card border border-border rounded-lg p-2 shadow-lg text-xs">
                      <p className="font-semibold">{d.icon} {d.name}</p>
                      <p className="font-mono">₹{d.value.toLocaleString('en-IN')} ({pct}%)</p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center">
            <div className="w-[140px] h-[140px] rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
              <p className="text-xs text-muted-foreground text-center px-4">No {label.toLowerCase()}s this month</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 py-3 space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => { const prev = format(subMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM'); if (months.some(m => m.value === prev)) onMonthChange(prev); }}
          disabled={month === months[months.length - 1]?.value}
          className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
        ><ChevronLeft className="h-5 w-5" /></button>
        <Select value={month} onValueChange={onMonthChange}>
          <SelectTrigger className="flex-1 h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          onClick={() => { const next = format(addMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM'); if (months.some(m => m.value === next)) onMonthChange(next); }}
          disabled={month === months[0]?.value}
          className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
        ><ChevronRight className="h-5 w-5" /></button>
      </div>

      {/* Type filter */}
      <TransactionTypeFilter value={typeFilter} onChange={onTypeFilterChange} />

      {/* Summary Cards */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {summaryCards.map((card, i) => (
          <div key={i} className="min-w-[140px] rounded-2xl bg-card border border-border p-3 shadow-sm flex-shrink-0">
            <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
            <p className={`font-semibold text-sm ${card.color || ''} ${i === 0 ? 'font-mono' : ''}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Dual Pie Charts */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
        <div className="flex gap-4">
          {renderDonut(debitCategoryData, totalDebits, 'Out', 'Spending', '💸')}
          {renderDonut(creditCategoryData, totalCredits, 'In', 'Income', '💰')}
        </div>

        {/* Combined Legend */}
        <div className="space-y-1 mt-3 pt-3 border-t border-border">
          {debitCategoryData.concat(creditCategoryData).map((d, i) => {
            const total = debitCategoryData.includes(d) ? totalDebits : totalCredits;
            const pct = total > 0 ? ((d.total / total) * 100).toFixed(1) : '0';
            return (
              <div key={`${d.category?.id}-${i}`} className="flex items-center gap-2 text-sm">
                <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.category?.color }} />
                <span className="text-xs">{d.category?.icon}</span>
                <span className="flex-1 truncate text-xs">{d.category?.name}</span>
                <span className="font-mono text-xs">₹{d.total.toLocaleString('en-IN')}</span>
                <span className="text-xs text-muted-foreground">({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-sm">Category Breakdown</h3>
        {breakdownData.map((d, idx) => {
          const pct = breakdownTotal > 0 ? (d.total / breakdownTotal) * 100 : 0;
          return (
            <div key={`${d.category?.id}-${idx}`}>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ backgroundColor: d.category?.color + '20' }}>
                  {d.category?.icon}
                </div>
                <div className="flex items-center gap-1.5 flex-1">
                  {d.isDebit ? (
                    <ArrowUpRight className="h-3 w-3 text-red-400 flex-shrink-0" />
                  ) : (
                    <ArrowDownLeft className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                  )}
                  <div>
                    <p className="font-medium text-sm">{d.category?.name}</p>
                    <p className="text-xs text-muted-foreground">{d.count} transaction{d.count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-mono text-sm font-semibold ${d.isDebit ? '' : 'text-emerald-600'}`}>
                    {d.isDebit ? '' : '+'}₹{d.total.toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-muted-foreground">{pct.toFixed(1)}%</p>
                </div>
              </div>
              <div className="h-1 bg-muted rounded-full mt-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: d.isDebit ? (d.category?.color || '#ccc') : '#10B981',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Top 5 */}
      {top5.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-sm">
            {typeFilter === 'credit' ? 'Biggest Credits This Month' : 'Biggest Spends This Month'}
          </h3>
          {top5.map(e => (
            <div key={e.id} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: (e.category?.color || '#ccc') + '20' }}>
                {e.category?.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.description}</p>
                <p className="text-xs text-muted-foreground">{e.date} · {e.category?.name}</p>
              </div>
              <p className={`font-mono text-sm font-semibold ${e.is_debit ? '' : 'text-emerald-600'}`}>
                {e.is_debit ? '' : '+'}₹{e.amount.toLocaleString('en-IN')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
