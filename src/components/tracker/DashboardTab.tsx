import { Expense, Category } from '@/types';
import { subMonths, format, parse } from 'date-fns';
import { ArrowUp, ArrowDown, ArrowsLeftRight, Receipt as ReceiptIcon } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { useMonthSwipe } from '@/hooks/useMonthSwipe';
import { useNavigate } from 'react-router-dom';
import { useExpenses, useExpenseMonths } from '@/hooks/useExpenses';
import TrackerToolBar, { SortOption } from './TrackerToolBar';
import TypeSegment from './TypeSegment';
import CategoryDot from '@/components/CategoryDot';
import type { TransactionFilter } from '@/hooks/useTransactionTypeFilter';
import { formatAmountShort, getCurrency } from '@/lib/currencies';
import CompareSheet from './CompareSheet';

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
  suspectedTransferCount: number;
  onOpenTransferReview: () => void;
}

function Sparkline({ values, color, width = 320, height = 40 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + (1 - (v - min) / range) * h;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  const area = d + ` L ${pts[pts.length - 1][0]} ${height} L ${pts[0][0]} ${height} Z`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={area} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="6" fill={color} opacity={0.18} />
    </svg>
  );
}

function StackedShareBar({ slices }: { slices: { id: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="h-3.5 rounded-full overflow-hidden flex bg-line-soft" style={{ gap: 2 }}>
      {slices.map(s => (
        <div key={s.id} style={{ flex: s.value / total, background: s.color }} />
      ))}
    </div>
  );
}

export default function DashboardTab({
  trackerId, trackerCurrency, expenses, categories,
  month, onMonthChange, isLoading, typeFilter, onTypeFilterChange,
  suspectedTransferCount, onOpenTransferReview,
}: Props) {
  const { data: months = [{ value: 'all', label: 'All Months' }] } = useExpenseMonths(trackerId);
  const navigate = useNavigate();
  const symbol = getCurrency(trackerCurrency).symbol;
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [compareOpen, setCompareOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useMonthSwipe(rootRef, months, month, onMonthChange);

  const isAllMonths = month === 'all';
  const prevMonth = isAllMonths ? '' : format(subMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
  const { data: prevExpenses } = useExpenses(trackerId, prevMonth);

  const monthLabel = months.find(m => m.value === month)?.label || month;
  const isSpendingView = typeFilter !== 'credit';

  const nonTransfer = useMemo(() => expenses.filter(e => !e.is_transfer), [expenses]);
  const debits = useMemo(() => nonTransfer.filter(e => e.is_debit), [nonTransfer]);
  const credits = useMemo(() => nonTransfer.filter(e => !e.is_debit), [nonTransfer]);

  const totalDebits = debits.reduce((s, e) => s + e.amount, 0);
  const totalCredits = credits.reduce((s, e) => s + e.amount, 0);

  const prevNonTransfer = useMemo(() => (prevExpenses || []).filter(e => !e.is_transfer), [prevExpenses]);
  const prevTotalDebits = prevNonTransfer.filter(e => e.is_debit).reduce((s, e) => s + e.amount, 0);
  const prevTotalCredits = prevNonTransfer.filter(e => !e.is_debit).reduce((s, e) => s + e.amount, 0);

  const heroTotal = isSpendingView ? totalDebits : totalCredits;
  const prevHeroTotal = isSpendingView ? prevTotalDebits : prevTotalCredits;
  const pctChange = prevHeroTotal > 0 ? Math.round(((heroTotal - prevHeroTotal) / prevHeroTotal) * 100) : null;

  const heroTxnCount = isSpendingView ? debits.length : credits.length;
  // Average per day in the month (approximate)
  const avgPerDay = useMemo(() => {
    if (heroTotal === 0) return 0;
    const dayKeys = new Set(nonTransfer.filter(e => isSpendingView ? e.is_debit : !e.is_debit).map(e => e.date));
    return Math.round(heroTotal / Math.max(dayKeys.size, 1));
  }, [heroTotal, nonTransfer, isSpendingView]);

  // Sparkline values: daily totals for the month (by date asc)
  const sparkValues = useMemo(() => {
    const map = new Map<string, number>();
    nonTransfer
      .filter(e => isSpendingView ? e.is_debit : !e.is_debit)
      .forEach(e => {
        map.set(e.date, (map.get(e.date) || 0) + e.amount);
      });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [nonTransfer, isSpendingView]);

  // Category aggregation for "Where it went" / "Where it came from"
  const targetSet = isSpendingView ? debits : credits;
  const prevTargetSet = useMemo(
    () => prevNonTransfer.filter(e => isSpendingView ? e.is_debit : !e.is_debit),
    [prevNonTransfer, isSpendingView]
  );

  const categoryBreakdown = useMemo(() => {
    const agg = new Map<string, { value: number; count: number; cat: Category }>();
    targetSet.forEach(e => {
      const cat = categories.find(c => c.id === e.category_id);
      if (!cat) return;
      const entry = agg.get(cat.id) || { value: 0, count: 0, cat };
      entry.value += e.amount;
      entry.count += 1;
      agg.set(cat.id, entry);
    });
    const prevAgg = new Map<string, number>();
    prevTargetSet.forEach(e => {
      prevAgg.set(e.category_id, (prevAgg.get(e.category_id) || 0) + e.amount);
    });
    return Array.from(agg.values())
      .map(item => {
        const prev = prevAgg.get(item.cat.id) || 0;
        const change = prev > 0 ? Math.round(((item.value - prev) / prev) * 100) : (item.value > 0 ? 100 : 0);
        return { ...item, change };
      })
      .sort((a, b) => b.value - a.value);
  }, [targetSet, prevTargetSet, categories]);

  const totalBreakdown = categoryBreakdown.reduce((s, c) => s + c.value, 0);

  // Biggest transactions
  const biggest = useMemo(() => [...targetSet].sort((a, b) => b.amount - a.amount).slice(0, 5), [targetSet]);

  const handleCategoryClick = (categoryId: string) => {
    navigate(`/tracker/${trackerId}?tab=expenses&type=${typeFilter}&filterCategory=${categoryId}&month=${month}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-3 px-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl bg-card border border-line-soft p-4 animate-pulse h-40" />
        ))}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="pb-4">
      <TrackerToolBar
        monthLabel={monthLabel}
        months={months}
        currentMonth={month}
        onMonthChange={onMonthChange}
        sort={sortBy}
        onSortChange={setSortBy}
        filterCount={0}
        onOpenFilter={() => { /* no-op on dashboard */ }}
        transferCount={suspectedTransferCount}
        onOpenTransferReview={onOpenTransferReview}
      />

      <TypeSegment value={typeFilter} onChange={onTypeFilterChange} />

      {/* Hero: this month total + sparkline */}
      <div className="mx-4 mb-3 rounded-3xl bg-card border border-line-soft p-5">
        <div className="text-[11px] font-semibold tracking-wider uppercase text-ink-faint">
          {isSpendingView ? `You spent in ${monthLabel}` : `You earned in ${monthLabel}`}
        </div>
        <div className="flex items-baseline gap-2.5 mt-1">
          <div className="font-display tabular-nums text-ink" style={{ fontSize: 40, fontWeight: 500, letterSpacing: '-0.04em' }}>
            {symbol}{Math.round(heroTotal).toLocaleString('en-IN')}
          </div>
          {pctChange !== null && (
            <span
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{
                background: pctChange === 0
                  ? 'hsl(var(--chip-bg))'
                  : (isSpendingView ? pctChange > 0 : pctChange < 0)
                    ? 'hsl(var(--spend-bg))'
                    : 'hsl(var(--earn-bg))',
                color: pctChange === 0
                  ? 'hsl(var(--ink-soft))'
                  : (isSpendingView ? pctChange > 0 : pctChange < 0)
                    ? 'hsl(var(--spend))'
                    : 'hsl(var(--earn))',
              }}
            >
              {pctChange !== 0 && (pctChange > 0
                ? <ArrowUp size={11} weight="bold" />
                : <ArrowDown size={11} weight="bold" />
              )}
              {Math.abs(pctChange)}% vs last
            </span>
          )}
        </div>
        <div className="mt-2 text-[12px] text-ink-soft font-medium">
          Avg {symbol}{avgPerDay.toLocaleString('en-IN')} / day · {heroTxnCount} transaction{heroTxnCount !== 1 ? 's' : ''}
        </div>
        {sparkValues.length >= 2 && (
          <div className="mt-3 -mx-1">
            <Sparkline values={sparkValues} color="hsl(var(--ember))" width={320} height={40} />
          </div>
        )}
      </div>

      {/* Where it went */}
      {categoryBreakdown.length > 0 && (
        <div className="mx-4 mb-3 rounded-3xl bg-card border border-line-soft p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-display font-semibold text-[16px] text-ink" style={{ letterSpacing: '-0.02em' }}>
              {isSpendingView ? 'Where it went' : 'Where it came from'}
            </h3>
            {!isAllMonths && (
              <button
                onClick={() => setCompareOpen(true)}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-soft hover:text-ember transition-colors"
              >
                <ArrowsLeftRight size={13} /> Compare
              </button>
            )}
          </div>

          <StackedShareBar slices={categoryBreakdown.map(c => ({ id: c.cat.id, value: c.value, color: c.cat.color }))} />

          <div className="mt-3 flex flex-col">
            {categoryBreakdown.map((c, idx) => {
              const pct = totalBreakdown > 0 ? ((c.value / totalBreakdown) * 100).toFixed(1) : '0.0';
              // "Bad" change depends on view: more spending is bad; more income is good
              const isBad = isSpendingView ? c.change > 0 : c.change < 0;
              const isGood = isSpendingView ? c.change < 0 : c.change > 0;
              const trendColor = c.change === 0
                ? 'hsl(var(--ink-faint))'
                : isBad
                  ? 'hsl(var(--spend))'
                  : isGood
                    ? 'hsl(var(--earn))'
                    : 'hsl(var(--ink-faint))';
              return (
                <button
                  key={c.cat.id}
                  onClick={() => handleCategoryClick(c.cat.id)}
                  className="flex items-center gap-3 py-2.5 text-left"
                  style={{ borderTop: idx === 0 ? 'none' : '1px solid hsl(var(--line-soft))' }}
                >
                  <CategoryDot icon={c.cat.icon} color={c.cat.color} size={34} />
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-semibold text-[14px] text-ink truncate" style={{ letterSpacing: '-0.01em' }}>
                      {c.cat.name}
                    </div>
                    <div className="text-[11.5px] text-ink-faint font-medium mt-0.5">
                      {c.count} txn{c.count !== 1 ? 's' : ''} · {pct}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[14px] font-semibold text-ink tabular-nums">
                      {formatAmountShort(c.value, trackerCurrency)}
                    </div>
                    <div
                      className="inline-flex items-center gap-0.5 text-[11px] font-semibold mt-0.5"
                      style={{ color: trendColor }}
                    >
                      {c.change !== 0 && (c.change > 0
                        ? <ArrowUp size={10} weight="bold" />
                        : <ArrowDown size={10} weight="bold" />)}
                      {c.change === 0 ? 'flat' : `${Math.abs(c.change)}%`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Biggest */}
      {biggest.length > 0 && (
        <div className="mx-4 mb-3 rounded-3xl bg-card border border-line-soft p-5">
          <h3 className="font-display font-semibold text-[16px] text-ink mb-2" style={{ letterSpacing: '-0.02em' }}>
            Biggest this month
          </h3>
          {biggest.map((e, i) => {
            const cat = categories.find(c => c.id === e.category_id);
            return (
              <div
                key={e.id}
                className="flex items-center gap-3 py-2.5"
                style={{ borderTop: i === 0 ? 'none' : '1px solid hsl(var(--line-soft))' }}
              >
                <span
                  className="inline-flex items-center justify-center rounded-full font-mono font-bold text-[11px]"
                  style={{
                    width: 22, height: 22,
                    background: 'hsl(var(--surface-alt))',
                    color: 'hsl(var(--ink-soft))',
                  }}
                >
                  {i + 1}
                </span>
                <CategoryDot icon={cat?.icon || 'Tag'} color={cat?.color || 'hsl(var(--ember))'} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold text-[14px] text-ink truncate" style={{ letterSpacing: '-0.01em' }}>
                    {e.merchant_name || e.description}
                  </div>
                  <div className="text-[11px] text-ink-faint font-medium">{cat?.name || '—'}</div>
                </div>
                <div className="font-mono font-semibold text-[14px] text-ink tabular-nums">
                  {formatAmountShort(e.amount, trackerCurrency)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isAllMonths && (
        <CompareSheet
          open={compareOpen}
          onOpenChange={setCompareOpen}
          trackerId={trackerId}
          trackerCurrency={trackerCurrency}
          categories={categories}
          monthA={month}
          isSpendingView={isSpendingView}
        />
      )}

      {/* Empty fallback */}
      {categoryBreakdown.length === 0 && biggest.length === 0 && (
        <div className="text-center py-16 px-4">
          <ReceiptIcon size={64} color="hsl(var(--ink-faint) / 0.45)" className="mx-auto mb-4" />
          <p className="font-display font-semibold text-lg text-ink">No data in {monthLabel}</p>
          <p className="text-sm text-ink-soft">Add some transactions to see the dashboard</p>
        </div>
      )}
    </div>
  );
}
