import { Expense, Category } from '@/types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { subMonths, addMonths, format, parse } from 'date-fns';
import { BarChart2, ArrowUpRight, ArrowDownLeft, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, ChevronRightIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useExpenses } from '@/hooks/useExpenses';
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
  trackerId: string;
  expenses: Expense[];
  categories: Category[];
  month: string;
  onMonthChange: (m: string) => void;
  isLoading: boolean;
  typeFilter: TransactionFilter;
  onTypeFilterChange: (v: TransactionFilter) => void;
}

export default function DashboardTab({ trackerId, expenses, categories, month, onMonthChange, isLoading, typeFilter, onTypeFilterChange }: Props) {
  const months = generateMonths();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleCategoryClick = (categoryId: string, isDebit: boolean) => {
    const typeValue = isDebit ? 'debit' : 'credit';
    navigate(`/tracker/${trackerId}?tab=expenses&type=${typeValue}&filterCategory=${categoryId}`);
  };

  // Fetch previous month data for MoM trend
  const prevMonth = format(subMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
  const { data: prevExpenses } = useExpenses(trackerId, prevMonth);

  const debitExpenses = useMemo(() => expenses.filter(e => e.is_debit), [expenses]);
  const creditExpenses = useMemo(() => expenses.filter(e => !e.is_debit), [expenses]);
  const totalDebits = debitExpenses.reduce((s, e) => s + e.amount, 0);
  const totalCredits = creditExpenses.reduce((s, e) => s + e.amount, 0);

  // Previous month totals
  const prevDebitTotal = useMemo(() => (prevExpenses || []).filter(e => e.is_debit).reduce((s, e) => s + e.amount, 0), [prevExpenses]);
  const prevCreditTotal = useMemo(() => (prevExpenses || []).filter(e => !e.is_debit).reduce((s, e) => s + e.amount, 0), [prevExpenses]);

  // MoM percentage change
  const getMoMTrend = (current: number, previous: number) => {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return { pct: 100, direction: 'up' as const };
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct === 0) return { pct: 0, direction: 'flat' as const };
    return { pct: Math.abs(pct), direction: pct > 0 ? 'up' as const : 'down' as const };
  };

  // Trend color depends on context: for spending, up is bad; for income, up is good
  const getTrendColor = (direction: 'up' | 'down' | 'flat', context: 'spending' | 'income') => {
    if (direction === 'flat') return 'text-muted-foreground';
    if (context === 'spending') {
      return direction === 'up' ? 'text-amber-600' : 'text-emerald-600';
    }
    // income
    return direction === 'up' ? 'text-emerald-600' : 'text-amber-600';
  };

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

  // Net category breakdown for "All" mode
  const netCategoryData = useMemo(() => {
    const map: Record<string, { category: Category; debitTotal: number; creditTotal: number; count: number }> = {};
    expenses.forEach(e => {
      if (!map[e.category_id]) {
        map[e.category_id] = { category: e.category || categories.find(c => c.id === e.category_id)!, debitTotal: 0, creditTotal: 0, count: 0 };
      }
      if (e.is_debit) map[e.category_id].debitTotal += e.amount;
      else map[e.category_id].creditTotal += e.amount;
      map[e.category_id].count++;
    });
    return Object.values(map)
      .map(d => ({
        category: d.category,
        total: Math.abs(d.debitTotal - d.creditTotal),
        count: d.count,
        isDebit: d.debitTotal >= d.creditTotal,
        debitTotal: d.debitTotal,
        creditTotal: d.creditTotal,
      }))
      .sort((a, b) => b.total - a.total);
  }, [expenses, categories]);

  // Summary cards with MoM trend
  type SummaryCard = { label: string; value: string; color?: string; trend?: { pct: number; direction: 'up' | 'down' | 'flat' } | null; trendContext?: 'spending' | 'income' };
  const summaryCards = useMemo((): SummaryCard[] => {
    const hasPrevData = prevExpenses !== undefined;
    if (typeFilter === 'debit') {
      const trend = hasPrevData ? getMoMTrend(totalDebits, prevDebitTotal) : null;
      const largest = [...debitExpenses].sort((a, b) => b.amount - a.amount)[0];
      return [
        { label: 'Total Spent', value: `₹${Math.round(totalDebits).toLocaleString('en-IN')}`, color: 'text-red-600', trend, trendContext: 'spending' },
        { label: 'Transactions', value: String(debitExpenses.length) },
        { label: 'Largest Expense', value: largest ? `₹${Math.round(largest.amount).toLocaleString('en-IN')}` : '-' },
      ];
    } else if (typeFilter === 'credit') {
      const trend = hasPrevData ? getMoMTrend(totalCredits, prevCreditTotal) : null;
      const largest = [...creditExpenses].sort((a, b) => b.amount - a.amount)[0];
      return [
        { label: 'Total Received', value: `₹${Math.round(totalCredits).toLocaleString('en-IN')}`, color: 'text-emerald-600', trend, trendContext: 'income' },
        { label: 'Transactions', value: String(creditExpenses.length) },
        { label: 'Largest Credit', value: largest ? `₹${Math.round(largest.amount).toLocaleString('en-IN')}` : '-', color: 'text-emerald-600' },
      ];
    } else {
      const debitTrend = hasPrevData ? getMoMTrend(totalDebits, prevDebitTotal) : null;
      const creditTrend = hasPrevData ? getMoMTrend(totalCredits, prevCreditTotal) : null;
      const net = totalDebits - totalCredits;
      return [
        { label: 'Total Out', value: `₹${Math.round(totalDebits).toLocaleString('en-IN')}`, color: 'text-red-600', trend: debitTrend, trendContext: 'spending' },
        { label: 'Total In', value: `₹${Math.round(totalCredits).toLocaleString('en-IN')}`, color: 'text-emerald-600', trend: creditTrend, trendContext: 'income' },
        { label: 'Net Balance', value: `${net < 0 ? '+' : ''}₹${Math.round(Math.abs(net)).toLocaleString('en-IN')}`, color: net <= 0 ? 'text-emerald-600' : 'text-red-600' },
      ];
    }
  }, [typeFilter, debitExpenses, creditExpenses, totalDebits, totalCredits, prevDebitTotal, prevCreditTotal, prevExpenses]);

  // Category breakdown based on filter
  const breakdownData = useMemo(() => {
    if (typeFilter === 'debit') return debitCategoryData.map(d => ({ ...d, isDebit: true }));
    if (typeFilter === 'credit') return creditCategoryData.map(d => ({ ...d, isDebit: false }));
    return netCategoryData;
  }, [typeFilter, debitCategoryData, creditCategoryData, netCategoryData]);

  const breakdownMaxTotal = Math.max(...breakdownData.map(d => d.total), 1);

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
      <div>
        <p className="text-sm font-semibold text-muted-foreground text-center mb-2">{emoji} {title}</p>
        {hasData ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data.map(d => ({ name: d.category?.name, value: d.total, color: d.category?.color, icon: d.category?.icon, id: d.category?.id }))}
                cx="50%"
                cy="50%"
                outerRadius={95}
                innerRadius={58}
                dataKey="value"
                stroke="none"
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.category?.color || '#ccc'} />
                ))}
                <Label
                  content={() => (
                    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                      <tspan x="50%" dy="-6" className="fill-foreground font-mono text-base font-bold">
                        ₹{Math.round(total).toLocaleString('en-IN')}
                      </tspan>
                      <tspan x="50%" dy="18" className="fill-muted-foreground text-[10px]">
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
                      <p className="font-mono">₹{Math.round(d.value).toLocaleString('en-IN')} ({pct}%)</p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[220px] flex items-center justify-center">
            <div className="w-[160px] h-[160px] rounded-full border-2 border-dashed border-muted-foreground/20 flex items-center justify-center">
              <p className="text-xs text-muted-foreground text-center px-4">No {label.toLowerCase()}s<br />this month</p>
            </div>
          </div>
        )}
        {/* Inline legend for this chart */}
        {hasData && (
          <div className="space-y-1.5 mt-1 px-2">
            {data.slice(0, 5).map((d, i) => {
              const pct = total > 0 ? ((d.total / total) * 100).toFixed(1) : '0';
              return (
                <div key={`${d.category?.id}-${i}`} className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.category?.color }} />
                  <span className="flex-1 truncate text-xs text-muted-foreground">{d.category?.icon} {d.category?.name}</span>
                  <span className="font-mono text-xs">₹{Math.round(d.total).toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-muted-foreground w-10 text-right">{pct}%</span>
                </div>
              );
            })}
            {data.length > 5 && (
              <p className="text-[10px] text-muted-foreground text-center">+{data.length - 5} more categories</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 py-3 space-y-4">
      {/* Month selector */}
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
          <div key={i} className="min-w-[130px] flex-1 rounded-2xl bg-card border border-border p-3 shadow-sm">
            <p className="text-[11px] text-muted-foreground mb-1">{card.label}</p>
            <p className={`font-semibold text-sm font-mono ${card.color || ''}`}>{card.value}</p>
            {card.trend && card.trendContext && (
              <div className={`flex items-center gap-0.5 mt-1.5 ${getTrendColor(card.trend.direction, card.trendContext)}`}>
                {card.trend.direction === 'up' ? <TrendingUp className="h-3 w-3" /> :
                  card.trend.direction === 'down' ? <TrendingDown className="h-3 w-3" /> :
                  <Minus className="h-3 w-3" />}
                <span className="text-[10px] font-medium">
                  {card.trend.direction === 'flat' ? 'Same as' : `${card.trend.pct}% vs`} last month
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pie Charts — Stacked vertically, filter-aware */}
      <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
        <div className="space-y-6">
          {(typeFilter === 'all' || typeFilter === 'debit') &&
            renderDonut(debitCategoryData, totalDebits, 'Out', 'Spending', '💸')
          }
          {(typeFilter === 'all' || typeFilter === 'credit') &&
            renderDonut(creditCategoryData, totalCredits, 'In', 'Income', '💰')
          }
        </div>
      </div>

      {/* Category Breakdown */}
      {breakdownData.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-sm">
            {typeFilter === 'debit' ? 'Spending by Category' : typeFilter === 'credit' ? 'Income by Category' : 'Category Breakdown (Net)'}
          </h3>
          {breakdownData.map((d, idx) => {
            const pctOfMax = breakdownMaxTotal > 0 ? (d.total / breakdownMaxTotal) * 100 : 0;
            const pctOfTotal = typeFilter === 'all'
              ? (totalDebits + totalCredits > 0 ? (d.total / (totalDebits + totalCredits)) * 100 : 0)
              : typeFilter === 'debit'
                ? (totalDebits > 0 ? (d.total / totalDebits) * 100 : 0)
                : (totalCredits > 0 ? (d.total / totalCredits) * 100 : 0);
            return (
              <button
                key={`${d.category?.id}-${idx}`}
                className="w-full text-left hover:bg-muted/50 -mx-2 px-2 py-1.5 rounded-xl transition-colors cursor-pointer"
                onClick={() => d.category?.id && handleCategoryClick(d.category.id, d.isDebit)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ backgroundColor: (d.category?.color || '#ccc') + '20' }}>
                    {d.category?.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {typeFilter === 'all' && (
                        d.isDebit ? (
                          <ArrowUpRight className="h-3 w-3 text-red-400 flex-shrink-0" />
                        ) : (
                          <ArrowDownLeft className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                        )
                      )}
                      <p className="font-medium text-sm truncate">{d.category?.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{d.count} txn{d.count !== 1 ? 's' : ''} · {pctOfTotal.toFixed(1)}%</p>
                  </div>
                  <p className={`font-mono text-sm font-semibold flex-shrink-0 ${d.isDebit ? 'text-foreground' : 'text-emerald-600'}`}>
                    {d.isDebit ? '' : '+'}₹{Math.round(d.total).toLocaleString('en-IN')}
                  </p>
                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                </div>
                <div className="h-1.5 bg-muted rounded-full mt-2 ml-[52px]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pctOfMax}%`,
                      backgroundColor: d.isDebit ? (d.category?.color || '#ccc') : '#10B981',
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Top 5 */}
      {top5.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-sm">
            {typeFilter === 'credit' ? '💰 Biggest Credits' : '💸 Biggest Spends'}
          </h3>
          {top5.map((e, idx) => (
            <div key={e.id} className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
                {idx + 1}
              </div>
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: ((e.category?.color || '#ccc') + '20') }}>
                {e.category?.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{e.description}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(e.date + 'T00:00:00'), 'd MMM')} · {e.category?.name}</p>
              </div>
              <p className={`font-mono text-sm font-semibold flex-shrink-0 ${e.is_debit ? '' : 'text-emerald-600'}`}>
                {e.is_debit ? '' : '+'}₹{Math.round(e.amount).toLocaleString('en-IN')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
