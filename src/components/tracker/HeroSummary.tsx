import { Calendar } from '@phosphor-icons/react';
import { formatAmountShort, getCurrency } from '@/lib/currencies';
import MonthNavChevrons from './MonthNavChevrons';

interface Props {
  monthLabel: string;
  /** Category-based net outgo — headline figure. Always ≤ totalOut. */
  netOutgo: number;
  /** Total debits in view. */
  totalOut: number;
  /** Total credits in view. */
  totalIn: number;
  currencyCode: string;
  /** Tap to move to the older month. Omit when current is the oldest. */
  onPrevMonth?: () => void;
  /** Tap to move to the newer month. Omit when current is the newest. */
  onNextMonth?: () => void;
}

export default function HeroSummary({ monthLabel, netOutgo, totalOut, totalIn, currencyCode, onPrevMonth, onNextMonth }: Props) {
  const symbol = getCurrency(currencyCode).symbol;

  return (
    <div className="mx-4 mb-3 rounded-3xl hero-card p-5">
      {/* Month-nav chevron affordances — subtle hints for the swipe gesture. */}
      <MonthNavChevrons onPrev={onPrevMonth} onNext={onNextMonth} tone="dark" />

      {/* Decorative dots */}
      <div
        className="absolute pointer-events-none"
        style={{ right: -40, top: -40, width: 140, height: 140, borderRadius: 999, background: 'hsl(var(--ember))', opacity: 0.18 }}
      />
      <div
        className="absolute pointer-events-none"
        style={{ right: 16, top: 16, width: 64, height: 64, borderRadius: 999, background: 'hsl(var(--ember))', opacity: 0.40 }}
      />

      <div className="relative flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider opacity-65">
        <span>Net expense amount</span>
        <span className="inline-flex items-center gap-1">
          <Calendar size={11} weight="bold" /> {monthLabel}
        </span>
      </div>

      <div
        className="relative font-display tabular-nums mt-1.5"
        style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-0.04em', lineHeight: 1.05 }}
      >
        {symbol}{Math.round(netOutgo).toLocaleString('en-IN')}
      </div>

      <div className="relative mt-3.5 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl px-3 py-2 flex flex-col gap-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <span className="text-[10px] font-medium opacity-70 tracking-wide uppercase">Total Out</span>
          <span className="font-mono font-semibold text-[13px]" style={{ color: '#F2B6A8' }}>
            {formatAmountShort(totalOut, currencyCode)}
          </span>
        </div>
        <div className="rounded-xl px-3 py-2 flex flex-col gap-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <span className="text-[10px] font-medium opacity-70 tracking-wide uppercase">Total In</span>
          <span className="font-mono font-semibold text-[13px]" style={{ color: '#9DDFB3' }}>
            {formatAmountShort(totalIn, currencyCode)}
          </span>
        </div>
      </div>
    </div>
  );
}
