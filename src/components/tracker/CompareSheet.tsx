import { useMemo, useState, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowUp, ArrowDown, ArrowsLeftRight, ArrowRight, CaretDown, Check, Minus } from '@phosphor-icons/react';
import { format, parse, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Category, Expense } from '@/types';
import { useExpenses, useExpenseMonths } from '@/hooks/useExpenses';
import { formatAmountShort, getCurrency } from '@/lib/currencies';
import CategoryDot from '@/components/CategoryDot';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackerId: string;
  trackerCurrency: string;
  categories: Category[];
  monthA: string; // 'yyyy-MM' (never 'all' — caller hides the trigger in that case)
  isSpendingView: boolean;
}

interface CatRow {
  cat: Category;
  a: number;
  b: number;
  countA: number;
  countB: number;
}

function prevMonthOf(month: string): string {
  return format(subMonths(parse(month, 'yyyy-MM', new Date()), 1), 'yyyy-MM');
}

function aggregate(expenses: Expense[], isSpendingView: boolean) {
  const filtered = expenses.filter(e => !e.is_transfer && (isSpendingView ? e.is_debit : !e.is_debit));
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const byCat = new Map<string, { value: number; count: number }>();
  filtered.forEach(e => {
    const entry = byCat.get(e.category_id) || { value: 0, count: 0 };
    entry.value += e.amount;
    entry.count += 1;
    byCat.set(e.category_id, entry);
  });
  return { total, byCat, txnCount: filtered.length };
}

export default function CompareSheet({
  open, onOpenChange, trackerId, trackerCurrency, categories, monthA, isSpendingView,
}: Props) {
  const symbol = getCurrency(trackerCurrency).symbol;
  const navigate = useNavigate();
  const { data: monthsList = [] } = useExpenseMonths(trackerId);
  const [monthB, setMonthB] = useState<string>(() => prevMonthOf(monthA));
  const [pickerOpen, setPickerOpen] = useState(false);
  // Drill-down: which category row is currently showing the
  // "Open <month>" action buttons. Null when collapsed.
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);

  const openMonthForCategory = (catMonth: string, catId: string) => {
    onOpenChange(false);
    navigate(`/tracker/${trackerId}?tab=expenses&month=${catMonth}&filterCategory=${catId}`);
  };

  // Reset monthB when monthA changes or when the sheet reopens, defaulting to the prior month.
  // Also collapse any expanded category row when the sheet opens, so we don't surprise the
  // user with stale UI state from the previous open.
  useEffect(() => {
    if (open) {
      setMonthB(prevMonthOf(monthA));
      setExpandedCatId(null);
    }
  }, [open, monthA]);

  const { data: expensesA = [], isLoading: loadingA } = useExpenses(trackerId, monthA);
  const { data: expensesB = [], isLoading: loadingB } = useExpenses(trackerId, monthB);

  const aggA = useMemo(() => aggregate(expensesA, isSpendingView), [expensesA, isSpendingView]);
  const aggB = useMemo(() => aggregate(expensesB, isSpendingView), [expensesB, isSpendingView]);

  const rows: CatRow[] = useMemo(() => {
    const ids = new Set<string>([...aggA.byCat.keys(), ...aggB.byCat.keys()]);
    const out: CatRow[] = [];
    ids.forEach(id => {
      const cat = categories.find(c => c.id === id);
      if (!cat) return;
      const a = aggA.byCat.get(id);
      const b = aggB.byCat.get(id);
      out.push({
        cat,
        a: a?.value || 0,
        b: b?.value || 0,
        countA: a?.count || 0,
        countB: b?.count || 0,
      });
    });
    return out.sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  }, [aggA, aggB, categories]);

  const labelA = monthsList.find(m => m.value === monthA)?.label || monthA;
  const labelB = monthsList.find(m => m.value === monthB)?.label || monthB;

  // Short MMM'YY form used inline in the per-category dual bars and on the
  // drill-down action buttons. Keeps each row legible at a glance without a
  // legend (the bottom "A = ... · B = ..." caption was retired).
  const shortLabel = (m: string) => {
    try {
      const d = parse(m, 'yyyy-MM', new Date());
      return `${format(d, 'MMM')}'${format(d, 'yy')}`;
    } catch {
      return m;
    }
  };
  const shortA = shortLabel(monthA);
  const shortB = shortLabel(monthB);

  const delta = aggA.total - aggB.total;
  const pctDelta = aggB.total > 0 ? Math.round((delta / aggB.total) * 100) : (aggA.total > 0 ? 100 : 0);
  // "Bad direction" = more spending or less income.
  const isBadDelta = isSpendingView ? delta > 0 : delta < 0;
  const isGoodDelta = isSpendingView ? delta < 0 : delta > 0;
  const deltaColor = delta === 0
    ? { bg: 'hsl(var(--chip-bg))', fg: 'hsl(var(--ink-soft))' }
    : isBadDelta
      ? { bg: 'hsl(var(--spend-bg))', fg: 'hsl(var(--spend))' }
      : { bg: 'hsl(var(--earn-bg))', fg: 'hsl(var(--earn))' };

  const maxRowValue = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.a, r.b), 0) || 1,
    [rows]
  );

  // Selectable months for B: every month with data except A itself.
  const otherMonths = useMemo(
    () => monthsList.filter(m => m.value !== 'all' && m.value !== monthA),
    [monthsList, monthA]
  );

  const swap = () => {
    // "Swap" reframes the comparison — A becomes the older period, B the newer one.
    // We can't actually change A here (it's owned by the parent), so swap nudges B
    // to take A's role: we approximate by setting B to be one step further back.
    // Simpler model: just no-op if there's only one alternative.
    if (otherMonths.length < 2) return;
    const idx = otherMonths.findIndex(m => m.value === monthB);
    const next = otherMonths[(idx + 1) % otherMonths.length];
    setMonthB(next.value);
  };

  const isLoading = loadingA || loadingB;
  const hasAnyData = aggA.total > 0 || aggB.total > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="p-0 rounded-t-3xl border-0 max-h-[88vh] flex flex-col"
        style={{ background: 'hsl(var(--background))' }}
      >
        <div className="mx-auto w-9 h-1 rounded-full bg-line mt-2 mb-3.5 shrink-0" />

        {/* Header */}
        <div className="px-5 pb-3 shrink-0">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display font-semibold text-[19px] text-ink" style={{ letterSpacing: '-0.02em' }}>
              Compare
            </h2>
            <button
              onClick={swap}
              disabled={otherMonths.length < 2}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-soft disabled:opacity-40"
            >
              <ArrowsLeftRight size={13} /> Swap
            </button>
          </div>
          <div className="mt-1 text-[12px] text-ink-faint font-medium">
            {isSpendingView ? 'Spending' : 'Income'} · {labelA} vs {labelB}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-6">
          {/* Headline cards: A and B side-by-side */}
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div className="rounded-2xl bg-card border border-line-soft p-3.5">
              <div className="text-[10.5px] font-semibold tracking-wider uppercase text-ink-faint truncate">
                {labelA}
              </div>
              <div className="font-display tabular-nums text-ink mt-1" style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.03em' }}>
                {symbol}{Math.round(aggA.total).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-ink-faint font-medium mt-0.5">
                {aggA.txnCount} txn{aggA.txnCount !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Month B card — tap to change */}
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button className="text-left rounded-2xl bg-card border border-line-soft p-3.5 hover:border-ember/55 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="text-[10.5px] font-semibold tracking-wider uppercase text-ink-faint truncate">
                      {labelB}
                    </div>
                    <CaretDown size={11} weight="bold" className="text-ink-faint shrink-0" />
                  </div>
                  <div className="font-display tabular-nums text-ink mt-1" style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.03em' }}>
                    {symbol}{Math.round(aggB.total).toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] text-ink-faint font-medium mt-0.5">
                    {aggB.txnCount} txn{aggB.txnCount !== 1 ? 's' : ''}
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[220px] p-1.5 rounded-2xl">
                <div className="max-h-[260px] overflow-y-auto">
                  {otherMonths.length === 0 ? (
                    <div className="px-3 py-2 text-[12px] text-ink-faint">No other months</div>
                  ) : (
                    otherMonths.map(m => (
                      <button
                        key={m.value}
                        onClick={() => { setMonthB(m.value); setPickerOpen(false); }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-[13px] font-medium text-ink hover:bg-surface-alt"
                      >
                        <span>{m.label}</span>
                        {m.value === monthB && <Check size={13} weight="bold" className="text-ember" />}
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Delta strip */}
          <div className="mb-4 rounded-2xl bg-card border border-line-soft px-4 py-3 flex items-center justify-between">
            <div className="text-[12px] font-semibold text-ink-soft">
              {delta === 0
                ? 'No change'
                : isSpendingView
                  ? (delta > 0 ? 'Spent more' : 'Spent less')
                  : (delta > 0 ? 'Earned more' : 'Earned less')}
            </div>
            <div
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold tabular-nums"
              style={{ background: deltaColor.bg, color: deltaColor.fg }}
            >
              {delta === 0
                ? <Minus size={11} weight="bold" />
                : delta > 0 ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
              {symbol}{Math.abs(Math.round(delta)).toLocaleString('en-IN')}
              <span className="text-ink-faint font-medium ml-1">
                {delta === 0 ? 'flat' : `${Math.abs(pctDelta)}%`}
              </span>
            </div>
          </div>

          {/* Per-category dual bars */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="rounded-2xl bg-card border border-line-soft h-16 animate-pulse" />
              ))}
            </div>
          ) : !hasAnyData ? (
            <div className="text-center py-10">
              <p className="font-display font-semibold text-[15px] text-ink">Nothing to compare</p>
              <p className="text-[12px] text-ink-soft mt-1">Neither month has {isSpendingView ? 'spending' : 'income'}.</p>
            </div>
          ) : (
            <>
              <div className="text-[11px] font-semibold tracking-wider uppercase text-ink-faint mb-2 px-1">
                By category
              </div>
              <div className="rounded-2xl bg-card border border-line-soft overflow-hidden">
                {rows.map((r, idx) => {
                  const rowDelta = r.a - r.b;
                  const rowPct = r.b > 0 ? Math.round((rowDelta / r.b) * 100) : (r.a > 0 ? 100 : 0);
                  const rowIsBad = isSpendingView ? rowDelta > 0 : rowDelta < 0;
                  const rowIsGood = isSpendingView ? rowDelta < 0 : rowDelta > 0;
                  const trendColor = rowDelta === 0
                    ? 'hsl(var(--ink-faint))'
                    : rowIsBad
                      ? 'hsl(var(--spend))'
                      : rowIsGood
                        ? 'hsl(var(--earn))'
                        : 'hsl(var(--ink-faint))';
                  const widthA = (r.a / maxRowValue) * 100;
                  const widthB = (r.b / maxRowValue) * 100;
                  const expanded = expandedCatId === r.cat.id;
                  return (
                    <div
                      key={r.cat.id}
                      style={{ borderTop: idx === 0 ? 'none' : '1px solid hsl(var(--line-soft))' }}
                    >
                      {/* Tappable summary — toggles the inline drill-down picker below. */}
                      <button
                        type="button"
                        onClick={() => setExpandedCatId(expanded ? null : r.cat.id)}
                        className="w-full text-left px-3.5 py-3"
                        aria-expanded={expanded}
                      >
                        <div className="flex items-center gap-2.5 mb-2">
                          <CategoryDot icon={r.cat.icon} color={r.cat.color} size={26} />
                          <div className="flex-1 min-w-0">
                            <div className="font-display font-semibold text-[13.5px] text-ink truncate" style={{ letterSpacing: '-0.01em' }}>
                              {r.cat.name}
                            </div>
                          </div>
                          <div
                            className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums"
                            style={{ color: trendColor }}
                          >
                            {rowDelta !== 0 && (rowDelta > 0
                              ? <ArrowUp size={10} weight="bold" />
                              : <ArrowDown size={10} weight="bold" />)}
                            {rowDelta === 0 ? 'flat' : `${Math.abs(rowPct)}%`}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          {/* Month A bar */}
                          <div className="flex items-center gap-2">
                            <div className="w-[52px] text-[10.5px] font-semibold text-ink-faint shrink-0 tabular-nums">{shortA}</div>
                            <div className="flex-1 h-2 rounded-full bg-line-soft overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${widthA}%`, background: r.cat.color }}
                              />
                            </div>
                            <div className="font-mono text-[11.5px] font-semibold text-ink tabular-nums shrink-0 w-[70px] text-right">
                              {formatAmountShort(r.a, trackerCurrency)}
                            </div>
                          </div>
                          {/* Month B bar */}
                          <div className="flex items-center gap-2">
                            <div className="w-[52px] text-[10.5px] font-semibold text-ink-faint shrink-0 tabular-nums">{shortB}</div>
                            <div className="flex-1 h-2 rounded-full bg-line-soft overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${widthB}%`, background: r.cat.color, opacity: 0.55 }}
                              />
                            </div>
                            <div className="font-mono text-[11.5px] font-semibold text-ink-soft tabular-nums shrink-0 w-[70px] text-right">
                              {formatAmountShort(r.b, trackerCurrency)}
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Inline drill-down: pick a month to open on Transactions tab. */}
                      {expanded && (
                        <div className="px-3.5 pb-3 -mt-1 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openMonthForCategory(monthA, r.cat.id); }}
                            disabled={r.a === 0}
                            className="inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition-colors disabled:opacity-40"
                            style={{
                              background: 'hsl(var(--ink))',
                              color: 'hsl(var(--background))',
                            }}
                          >
                            Open {shortA} <ArrowRight size={12} weight="bold" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openMonthForCategory(monthB, r.cat.id); }}
                            disabled={r.b === 0}
                            className="inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-semibold transition-colors disabled:opacity-40"
                            style={{
                              background: 'hsl(var(--surface-alt))',
                              color: 'hsl(var(--ink))',
                              border: '1px solid hsl(var(--line))',
                            }}
                          >
                            Open {shortB} <ArrowRight size={12} weight="bold" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
