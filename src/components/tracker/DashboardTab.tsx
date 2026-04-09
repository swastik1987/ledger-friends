import { Expense, Category } from '@/types';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { subMonths, format, parse } from 'date-fns';
import { BarChart2, ArrowUpRight, ArrowDownLeft, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, ChevronRightIcon, GitCompareArrows, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useExpenses, useExpenseMonths } from '@/hooks/useExpenses';
import { Button } from '@/components/ui/button';
import TransactionTypeFilter from './TransactionTypeFilter';
import Nudge from '@/components/Nudge';
import { useNudge } from '@/hooks/useNudge';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';
import { formatAmountShort } from '@/lib/currencies';

function NudgePieChart() {
  const { show, dismiss } = useNudge('dashboard-pie-chart');
  return (
    <div className="relative w-fit mx-auto">
      <Nudge show={show} onDismiss={dismiss} message="Tap any category in the breakdown to jump to those transactions. Use Compare to see month-over-month trends." position="bottom" />
    </div>
  );
}

interface Props {
  trackerId: string;
  trackerCurrency: string;
  expenses: Expense[];
  categories: Category[];
  month: string;
  onMonthChange: (m: string) => void;
  isLoading: boolean;
  typeFilter: TransactionFilter;
  onTypeFilterChange: (v: TransactionFilter) => void;
}

export default function DashboardTab({ trackerId, trackerCurrency, expenses, categories, month, onMonthChange, isLoading, typeFilter, onTypeFilterChange }: Props) {
  const { data: months = [{ value: 'all', label: 'All Months' }] } = useExpenseMonths(trackerId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleCategoryClick = (categoryId: string, isDebit: boolean) => {
    navigate(`/tracker/${trackerId}?tab=expenses&type=${typeFilter}&filterCategory=${categoryId}&month=${month}`);
  };

  // Fetch previous month data for MoM trend (skip when viewing all months)
  const isAllMonths = month === 'all';
  const prevMonth = isAllMonths ? '' : format(subMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
  const { data: prevExpenses } = useExpenses(trackerId, prevMonth);

  // Comparison mode state
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareMonth, setCompareMonth] = useState(() => prevMonth || format(subMonths(new Date(), 1), 'yyyy-MM'));
  // Available comparison months = all specific months except the currently selected one
  const compareMonths = useMemo(() => months.filter(m => m.value !== month && m.value !== 'all'), [months, month]);
  // Fetch comparison month data (only when enabled and not viewing all)
  const { data: compareExpenses } = useExpenses(trackerId, compareEnabled && !isAllMonths ? compareMonth : '');

  // Reset compare month to prev when main month changes; disable compare for "all"
  useEffect(() => {
    if (month === 'all') {
      setCompareEnabled(false);
      return;
    }
    const newPrev = format(subMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
    setCompareMonth(newPrev);
  }, [month]);

  // Exclude transfers from all dashboard calculations to avoid double-counting
  const nonTransferExpenses = useMemo(() => expenses.filter(e => !e.is_transfer), [expenses]);
  const debitExpenses = useMemo(() => nonTransferExpenses.filter(e => e.is_debit), [nonTransferExpenses]);
  const creditExpenses = useMemo(() => nonTransferExpenses.filter(e => !e.is_debit), [nonTransferExpenses]);
  const totalDebits = debitExpenses.reduce((s, e) => s + e.amount, 0);
  const totalCredits = creditExpenses.reduce((s, e) => s + e.amount, 0);

  // Previous month totals
  const prevDebitTotal = useMemo(() => (prevExpenses || []).filter(e => !e.is_transfer && e.is_debit).reduce((s, e) => s + e.amount, 0), [prevExpenses]);
  const prevCreditTotal = useMemo(() => (prevExpenses || []).filter(e => !e.is_transfer && !e.is_debit).reduce((s, e) => s + e.amount, 0), [prevExpenses]);

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

  // Net category breakdown for "All" mode (excluding transfers)
  const netCategoryData = useMemo(() => {
    const map: Record<string, { category: Category; debitTotal: number; creditTotal: number; count: number }> = {};
    nonTransferExpenses.forEach(e => {
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
  }, [nonTransferExpenses, categories]);

  // Summary cards with MoM trend
  type SummaryCard = { label: string; value: string; color?: string; trend?: { pct: number; direction: 'up' | 'down' | 'flat' } | null; trendContext?: 'spending' | 'income' };
  const summaryCards = useMemo((): SummaryCard[] => {
    const hasPrevData = prevExpenses !== undefined;
    if (typeFilter === 'debit') {
      const trend = hasPrevData ? getMoMTrend(totalDebits, prevDebitTotal) : null;
      const largest = [...debitExpenses].sort((a, b) => b.amount - a.amount)[0];
      return [
        { label: 'Total Spent', value: formatAmountShort(Math.round(totalDebits), trackerCurrency), color: 'text-red-600', trend, trendContext: 'spending' },
        { label: 'Transactions', value: String(debitExpenses.length) },
        { label: 'Largest Expense', value: largest ? formatAmountShort(Math.round(largest.amount), trackerCurrency) : '-' },
      ];
    } else if (typeFilter === 'credit') {
      const trend = hasPrevData ? getMoMTrend(totalCredits, prevCreditTotal) : null;
      const largest = [...creditExpenses].sort((a, b) => b.amount - a.amount)[0];
      return [
        { label: 'Total Received', value: formatAmountShort(Math.round(totalCredits), trackerCurrency), color: 'text-emerald-600', trend, trendContext: 'income' },
        { label: 'Transactions', value: String(creditExpenses.length) },
        { label: 'Largest Credit', value: largest ? formatAmountShort(Math.round(largest.amount), trackerCurrency) : '-', color: 'text-emerald-600' },
      ];
    } else {
      const debitTrend = hasPrevData ? getMoMTrend(totalDebits, prevDebitTotal) : null;
      const creditTrend = hasPrevData ? getMoMTrend(totalCredits, prevCreditTotal) : null;
      const net = totalDebits - totalCredits;
      return [
        { label: 'Total Out', value: formatAmountShort(Math.round(totalDebits), trackerCurrency), color: 'text-red-600', trend: debitTrend, trendContext: 'spending' },
        { label: 'Total In', value: formatAmountShort(Math.round(totalCredits), trackerCurrency), color: 'text-emerald-600', trend: creditTrend, trendContext: 'income' },
        { label: 'Net Balance', value: `${net < 0 ? '+' : ''}${formatAmountShort(Math.round(Math.abs(net)), trackerCurrency)}`, color: net <= 0 ? 'text-emerald-600' : 'text-red-600' },
      ];
    }
  }, [typeFilter, debitExpenses, creditExpenses, totalDebits, totalCredits, prevDebitTotal, prevCreditTotal, prevExpenses]);

  // Category breakdown based on filter
  const breakdownData = useMemo(() => {
    if (typeFilter === 'debit') return debitCategoryData.map(d => ({ ...d, isDebit: true }));
    if (typeFilter === 'credit') return creditCategoryData.map(d => ({ ...d, isDebit: false }));
    return netCategoryData;
  }, [typeFilter, debitCategoryData, creditCategoryData, netCategoryData]);

  // Build comparison category data
  const compareCategoryMap = useMemo(() => {
    if (!compareEnabled || !compareExpenses) return new Map<string, number>();
    const map = new Map<string, number>();
    const nonTransferCompare = compareExpenses.filter(e => !e.is_transfer);
    const filtered = typeFilter === 'debit'
      ? nonTransferCompare.filter(e => e.is_debit)
      : typeFilter === 'credit'
        ? nonTransferCompare.filter(e => !e.is_debit)
        : nonTransferCompare;
    filtered.forEach(e => {
      map.set(e.category_id, (map.get(e.category_id) || 0) + e.amount);
    });
    return map;
  }, [compareEnabled, compareExpenses, typeFilter]);

  // Merged breakdown: current + categories only in comparison month
  const mergedBreakdownData = useMemo(() => {
    if (!compareEnabled || !compareExpenses) return breakdownData;
    const currentCatIds = new Set(breakdownData.map(d => d.category?.id));
    const extraEntries: typeof breakdownData = [];
    compareCategoryMap.forEach((total, catId) => {
      if (!currentCatIds.has(catId)) {
        const cat = categories.find(c => c.id === catId);
        if (cat) {
          const isDebit = typeFilter === 'credit' ? false : typeFilter === 'debit' ? true :
            (compareExpenses || []).filter(e => e.category_id === catId && e.is_debit).reduce((s, e) => s + e.amount, 0) >=
            (compareExpenses || []).filter(e => e.category_id === catId && !e.is_debit).reduce((s, e) => s + e.amount, 0);
          extraEntries.push({ category: cat, total: 0, count: 0, isDebit: isDebit });
        }
      }
    });
    return [...breakdownData, ...extraEntries];
  }, [breakdownData, compareEnabled, compareExpenses, compareCategoryMap, categories, typeFilter]);

  const breakdownMaxTotal = Math.max(
    ...mergedBreakdownData.map(d => Math.max(d.total, compareCategoryMap.get(d.category?.id || '') || 0)),
    1
  );

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
            onClick={() => { if (month === 'all') return; const idx = months.findIndex(m => m.value === month); if (idx >= 0 && idx < months.length - 1) onMonthChange(months[idx + 1].value); }}
            disabled={month === 'all' || month === months[months.length - 1]?.value}
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
            onClick={() => { if (month === 'all') return; const idx = months.findIndex(m => m.value === month); if (idx > 1) onMonthChange(months[idx - 1].value); }}
            disabled={month === 'all' || month === months[1]?.value}
            className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
          ><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div className="text-center py-16">
          <BarChart2 className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
          <p className="font-semibold text-lg">No data for this period</p>
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
                        {formatAmountShort(Math.round(total), trackerCurrency)}
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
                      <p className="font-mono">{formatAmountShort(Math.round(d.value), trackerCurrency)} ({pct}%)</p>
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
                  <span className="font-mono text-xs">{formatAmountShort(Math.round(d.total), trackerCurrency)}</span>
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
          onClick={() => { if (month === 'all') return; const idx = months.findIndex(m => m.value === month); if (idx >= 0 && idx < months.length - 1) onMonthChange(months[idx + 1].value); }}
          disabled={month === 'all' || month === months[months.length - 1]?.value}
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
          onClick={() => { if (month === 'all') return; const idx = months.findIndex(m => m.value === month); if (idx > 1) onMonthChange(months[idx - 1].value); }}
          disabled={month === 'all' || month === months[1]?.value}
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

      <NudgePieChart />

      {/* Category Breakdown */}
      {(mergedBreakdownData.length > 0 || compareEnabled) && (
        <div className="rounded-2xl bg-card border border-border p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm">
              {typeFilter === 'debit' ? 'Spending by Category' : typeFilter === 'credit' ? 'Income by Category' : 'Category Breakdown (Net)'}
            </h3>
            {!compareEnabled ? (
              !isAllMonths && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-primary"
                onClick={() => setCompareEnabled(true)}
              >
                <GitCompareArrows className="h-3.5 w-3.5" />
                Compare
              </Button>
              )
            ) : (
              <button
                onClick={() => setCompareEnabled(false)}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {compareEnabled && (
            <div className="flex items-center gap-2 bg-muted/50 rounded-xl p-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">vs</span>
              <Select value={compareMonth} onValueChange={setCompareMonth}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {compareMonths.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {mergedBreakdownData.map((d, idx) => {
            const compareTotal = compareCategoryMap.get(d.category?.id || '') || 0;
            const pctOfMax = breakdownMaxTotal > 0 ? (d.total / breakdownMaxTotal) * 100 : 0;
            const comparePctOfMax = breakdownMaxTotal > 0 ? (compareTotal / breakdownMaxTotal) * 100 : 0;
            const pctOfTotal = typeFilter === 'all'
              ? (totalDebits + totalCredits > 0 ? (d.total / (totalDebits + totalCredits)) * 100 : 0)
              : typeFilter === 'debit'
                ? (totalDebits > 0 ? (d.total / totalDebits) * 100 : 0)
                : (totalCredits > 0 ? (d.total / totalCredits) * 100 : 0);
            // Change percentage for comparison
            const changePct = compareEnabled && compareTotal > 0
              ? Math.round(((d.total - compareTotal) / compareTotal) * 100)
              : compareEnabled && d.total > 0 ? 100 : null;
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
                    <p className="text-xs text-muted-foreground">
                      {d.count > 0 ? `${d.count} txn${d.count !== 1 ? 's' : ''} · ${pctOfTotal.toFixed(1)}%` : 'No txns this month'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-mono text-sm font-semibold ${d.isDebit ? 'text-foreground' : 'text-emerald-600'}`}>
                      {d.total > 0 ? `${d.isDebit ? '' : '+'}${formatAmountShort(Math.round(d.total), trackerCurrency)}` : '-'}
                    </p>
                    {compareEnabled && (
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {compareTotal > 0 ? formatAmountShort(Math.round(compareTotal), trackerCurrency) : '-'}
                        </span>
                        {changePct !== null && (
                          <span className={`text-[10px] font-medium ${
                            d.isDebit
                              ? (changePct > 0 ? 'text-amber-600' : 'text-emerald-600')
                              : (changePct > 0 ? 'text-emerald-600' : 'text-amber-600')
                          }`}>
                            {changePct > 0 ? '+' : ''}{changePct}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
                </div>
                <div className="mt-2 ml-[52px] space-y-1">
                  <div className="h-1.5 bg-muted rounded-full">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pctOfMax}%`,
                        backgroundColor: d.isDebit ? (d.category?.color || '#ccc') : '#10B981',
                      }}
                    />
                  </div>
                  {compareEnabled && (
                    <div className="h-1.5 bg-muted rounded-full">
                      <div
                        className="h-full rounded-full transition-all duration-500 opacity-40"
                        style={{
                          width: `${comparePctOfMax}%`,
                          backgroundColor: d.isDebit ? (d.category?.color || '#ccc') : '#10B981',
                        }}
                      />
                    </div>
                  )}
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
                {e.is_debit ? '' : '+'}{formatAmountShort(Math.round(e.amount), trackerCurrency)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
