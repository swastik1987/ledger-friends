import { Expense, Category } from '@/types';
import { subMonths, format, parse } from 'date-fns';
import { ArrowUp, ArrowDown, ArrowsLeftRight, Receipt as ReceiptIcon, Calendar } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { useMonthSwipe, adjacentMonths } from '@/hooks/useMonthSwipe';
import MonthNavChevrons from './MonthNavChevrons';
import { useNavigate } from 'react-router-dom';
import { useExpenses, useExpenseMonths } from '@/hooks/useExpenses';
import CategoryDot from '@/components/CategoryDot';
import { formatAmountShort, formatAmount, getCurrency } from '@/lib/currencies';
import { categoryFlows, categoryNetOutgo, netOutgoTotal, totalOut as sumOut, totalIn as sumIn, dailyOutgo } from '@/lib/netOutgo';
import CompareSheet from './CompareSheet';

interface Props {
  trackerId: string;
  trackerCurrency: string;
  expenses: Expense[];
  categories: Category[];
  month: string;
  onMonthChange: (m: string) => void;
  isLoading: boolean;
}

/**
 * Daily-outgo line with a stock-chart style scrubber: hovering or dragging
 * across the chart drops a vertical guide + dot on the nearest day and surfaces
 * a tooltip with that day's date and outgo amount. Endpoints are inset by
 * `padX` so the first/last day's indicator dot renders fully (the SVG clips its
 * own viewport) and stays easy to hit.
 */
function Sparkline({
  points, color, currencyCode, width = 320, height = 56,
}: {
  points: { date: string; value: number }[];
  color: string;
  currencyCode: string;
  width?: number;
  height?: number;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [active, setActive] = useState<number | null>(null);

  if (points.length < 2) return null;
  const values = points.map(p => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const padX = 10;
  const padY = 6;
  const w = width - padX * 2;
  const h = height - padY * 2;
  const pts = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * w;
    const y = padY + (1 - (p.value - min) / range) * h;
    return [x, y] as [number, number];
  });
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  const area = d + ` L ${pts[pts.length - 1][0]} ${height} L ${pts[0][0]} ${height} Z`;

  // Map a pointer x (CSS px) → nearest data point by comparing against each
  // point's plotted x. Scanning every point (rather than rounding a ratio)
  // makes the inset first/last days reliably selectable across the full width.
  const handleMove = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const vx = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dist = Math.abs(pts[i][0] - vx);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    setActive(best);
  };

  const sel = active != null ? pts[active] : null;
  const selPoint = active != null ? points[active] : null;
  // Keep the tooltip inside the card — flip anchoring near the right edge.
  const tipLeftPct = sel ? (sel[0] / width) * 100 : 0;
  const tipFlip = tipLeftPct > 60;

  return (
    <div className="relative" style={{ touchAction: 'pan-y' }}>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
        onMouseMove={e => handleMove(e.clientX)}
        onMouseLeave={() => setActive(null)}
        onTouchStart={e => handleMove(e.touches[0].clientX)}
        onTouchMove={e => handleMove(e.touches[0].clientX)}
        onTouchEnd={() => setActive(null)}
      >
        <path d={area} fill={color} opacity={0.18} />
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {sel ? (
          <>
            <line x1={sel[0]} y1={0} x2={sel[0]} y2={height} stroke={color} strokeWidth="1" opacity={0.4} />
            <circle cx={sel[0]} cy={sel[1]} r="4" fill={color} />
            <circle cx={sel[0]} cy={sel[1]} r="7" fill={color} opacity={0.22} />
          </>
        ) : (
          <>
            <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} />
            <circle cx={last[0]} cy={last[1]} r="6" fill={color} opacity={0.25} />
          </>
        )}
      </svg>
      {selPoint && (
        <div
          className="absolute top-0 pointer-events-none z-10 rounded-lg px-2 py-1 shadow-md whitespace-nowrap"
          style={{
            left: `${tipLeftPct}%`,
            transform: `translate(${tipFlip ? '-100%' : '0'}, -100%)`,
            marginLeft: tipFlip ? -6 : 6,
            background: 'hsl(var(--ink))',
            color: 'hsl(var(--background))',
          }}
        >
          <div className="text-[10px] font-semibold opacity-75 tabular-nums">
            {format(new Date(selPoint.date + 'T00:00:00'), 'EEE, d MMM')}
          </div>
          <div className="font-mono font-semibold text-[12px] tabular-nums">
            {formatAmount(selPoint.value, currencyCode)}
          </div>
        </div>
      )}
    </div>
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
  month, onMonthChange, isLoading,
}: Props) {
  const { data: months = [{ value: 'all', label: 'All Months' }] } = useExpenseMonths(trackerId);
  const navigate = useNavigate();
  const symbol = getCurrency(trackerCurrency).symbol;
  const [compareOpen, setCompareOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useMonthSwipe(rootRef, months, month, onMonthChange);
  const { prev: olderMonth, next: newerMonth } = adjacentMonths(months, month);

  const isAllMonths = month === 'all';
  const prevMonth = isAllMonths ? '' : format(subMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
  const { data: prevExpenses } = useExpenses(trackerId, prevMonth);

  const monthLabel = months.find(m => m.value === month)?.label || month;

  // Non-transfer expenses. Dashboard is outgo-centric: the headline is the
  // category-based Net Outgo (per-category outgo − inflow, only where outgo
  // wins). Total Out (all debits) + Total In (all credits) ride as sub-chips.
  const nonTransfer = useMemo(() => expenses.filter(e => !e.is_transfer), [expenses]);
  const debits = useMemo(() => nonTransfer.filter(e => e.is_debit), [nonTransfer]);
  const totalDebits = useMemo(() => sumOut(nonTransfer), [nonTransfer]);
  const totalCredits = useMemo(() => sumIn(nonTransfer), [nonTransfer]);
  const netOutgo = useMemo(() => netOutgoTotal(nonTransfer), [nonTransfer]);

  const prevNonTransfer = useMemo(() => (prevExpenses || []).filter(e => !e.is_transfer), [prevExpenses]);
  const prevNetOutgo = useMemo(() => netOutgoTotal(prevNonTransfer), [prevNonTransfer]);
  const pctChange = prevNetOutgo > 0
    ? Math.round(((netOutgo - prevNetOutgo) / prevNetOutgo) * 100)
    : null;

  // Average daily net outgo (over days that had at least one debit).
  const avgPerDay = useMemo(() => {
    if (netOutgo === 0) return 0;
    const dayKeys = new Set(debits.map(e => e.date));
    return Math.round(netOutgo / Math.max(dayKeys.size, 1));
  }, [netOutgo, debits]);

  // Sparkline data: daily outgo (total debits per day) across the month.
  const sparkPoints = useMemo(() => dailyOutgo(nonTransfer), [nonTransfer]);

  // Per-category breakdown by Net Outgo. Only categories where outgo > inflow
  // appear; the value shown is the net outgo (outgo − inflow). MoM change
  // compares against the previous month's net outgo for the same category.
  const categoryBreakdown = useMemo(() => {
    const flows = categoryFlows(nonTransfer);
    const counts = new Map<string, number>();
    debits.forEach(e => counts.set(e.category_id, (counts.get(e.category_id) || 0) + 1));
    const prevFlows = categoryFlows(prevNonTransfer);
    return Array.from(flows.entries())
      .map(([catId, flow]) => {
        const cat = categories.find(c => c.id === catId);
        const value = categoryNetOutgo(flow);
        return { catId, cat, value, count: counts.get(catId) || 0 };
      })
      .filter((item): item is { catId: string; cat: Category; value: number; count: number } =>
        item.cat != null && item.value > 0)
      .map(item => {
        const prev = prevFlows.get(item.catId);
        const prevValue = prev ? categoryNetOutgo(prev) : 0;
        const change = prevValue > 0
          ? Math.round(((item.value - prevValue) / prevValue) * 100)
          : (item.value > 0 ? 100 : 0);
        return { ...item, change };
      })
      .sort((a, b) => b.value - a.value);
  }, [nonTransfer, debits, prevNonTransfer, categories]);

  const totalBreakdown = categoryBreakdown.reduce((s, c) => s + c.value, 0);
  const biggest = useMemo(() => [...debits].sort((a, b) => b.amount - a.amount).slice(0, 5), [debits]);

  // Tapping a category card jumps to Transactions tab with the category
  // filter pre-applied. We force the type back to 'all' since Dashboard
  // no longer has a Type filter at all.
  const handleCategoryClick = (categoryId: string) => {
    navigate(`/tracker/${trackerId}?tab=expenses&type=all&filterCategory=${categoryId}&month=${month}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-3 px-4 pt-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl bg-card border border-line-soft p-4 animate-pulse h-40" />
        ))}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="pb-4">
      {/* Hero: Net Outgo + Total Out + Total In on the cream card surface
          so it visually rhymes with "Where it went" + "Biggest" below.
          The Transactions tab keeps the dark ink HeroSummary — that's the
          high-impact moment; here we want a calm overview. */}
      <div className="relative mx-4 mt-2 mb-3 rounded-3xl bg-card border border-line-soft p-5 overflow-hidden">
        <MonthNavChevrons
          tone="light"
          onPrev={olderMonth ? () => onMonthChange(olderMonth) : undefined}
          onNext={newerMonth ? () => onMonthChange(newerMonth) : undefined}
        />

        <div className="relative flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Net expense amount
          </span>
          {/* Ember-tinted pill — primary affordance on the lighter card. */}
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider"
            style={{
              background: 'hsl(var(--ember) / 0.12)',
              color: 'hsl(var(--ember))',
            }}
          >
            <Calendar size={11} weight="bold" /> {monthLabel}
          </span>
        </div>

        <div className="relative flex items-baseline gap-2.5 mt-1.5">
          <div
            className="font-display tabular-nums text-ink"
            style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-0.04em', lineHeight: 1.05 }}
          >
            {symbol}{Math.round(netOutgo).toLocaleString('en-IN')}
          </div>
          {pctChange !== null && (
            <span
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{
                background: pctChange === 0
                  ? 'hsl(var(--chip-bg))'
                  : pctChange > 0 ? 'hsl(var(--spend-bg))' : 'hsl(var(--earn-bg))',
                color: pctChange === 0
                  ? 'hsl(var(--ink-soft))'
                  : pctChange > 0 ? 'hsl(var(--spend))' : 'hsl(var(--earn))',
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

        <div className="relative mt-2 text-[12px] font-medium text-ink-soft">
          Avg {symbol}{avgPerDay.toLocaleString('en-IN')} / day · {debits.length} transaction{debits.length !== 1 ? 's' : ''}
        </div>

        {sparkPoints.length >= 2 && (
          <div className="relative mt-3 -mx-1">
            <Sparkline points={sparkPoints} color="hsl(var(--ember))" currencyCode={trackerCurrency} width={320} height={56} />
          </div>
        )}

        <div className="relative mt-3.5 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl px-3 py-2 flex flex-col gap-0.5 bg-surface-alt border border-line-soft">
            <span className="text-[10px] font-semibold text-ink-faint tracking-wider uppercase">Total Out</span>
            <span className="font-mono font-semibold text-[13px]" style={{ color: 'hsl(var(--spend))' }}>
              {formatAmountShort(totalDebits, trackerCurrency)}
            </span>
          </div>
          <div className="rounded-xl px-3 py-2 flex flex-col gap-0.5 bg-surface-alt border border-line-soft">
            <span className="text-[10px] font-semibold text-ink-faint tracking-wider uppercase">Total In</span>
            <span className="font-mono font-semibold text-[13px]" style={{ color: 'hsl(var(--earn))' }}>
              {formatAmountShort(totalCredits, trackerCurrency)}
            </span>
          </div>
        </div>
      </div>

      {/* Where it went — always debit-based now. */}
      {categoryBreakdown.length > 0 && (
        <div className="mx-4 mb-3 rounded-3xl bg-card border border-line-soft p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-display font-semibold text-[16px] text-ink" style={{ letterSpacing: '-0.02em' }}>
              Where it went
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
              // For outgo, an UP arrow (more spend) is bad → spend-red.
              const trendColor = c.change === 0
                ? 'hsl(var(--ink-faint))'
                : c.change > 0
                  ? 'hsl(var(--spend))'
                  : 'hsl(var(--earn))';
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

      {/* Biggest debits */}
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
          isSpendingView={true}
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
