import { Calendar } from '@phosphor-icons/react';
import { formatAmountShort, getCurrency } from '@/lib/currencies';

interface Props {
  monthLabel: string;
  spend: number;
  earn: number;
  currencyCode: string;
}

export default function HeroSummary({ monthLabel, spend, earn, currencyCode }: Props) {
  const net = earn - spend;
  const symbol = getCurrency(currencyCode).symbol;
  const sign = net >= 0 ? '+' : '−';
  const netAbs = Math.abs(net);

  return (
    <div className="mx-4 mb-3 rounded-3xl hero-card p-5">
      {/* decorative dots */}
      <div
        className="absolute pointer-events-none"
        style={{ right: -40, top: -40, width: 140, height: 140, borderRadius: 999, background: 'hsl(var(--ember))', opacity: 0.18 }}
      />
      <div
        className="absolute pointer-events-none"
        style={{ right: 16, top: 16, width: 64, height: 64, borderRadius: 999, background: 'hsl(var(--ember))', opacity: 0.40 }}
      />

      <div className="relative flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider opacity-65">
        <span>Net this month</span>
        <span className="inline-flex items-center gap-1">
          <Calendar size={11} weight="bold" /> {monthLabel}
        </span>
      </div>

      <div
        className="relative font-display tabular-nums mt-1.5"
        style={{ fontSize: 44, fontWeight: 500, letterSpacing: '-0.04em', lineHeight: 1.05 }}
      >
        {sign}{symbol}{netAbs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </div>

      <div className="relative mt-3.5 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl px-3 py-2.5 flex flex-col gap-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <span className="text-[10.5px] font-medium opacity-70 tracking-wide">↑ OUT</span>
          <span className="font-mono font-semibold text-[15px]">{formatAmountShort(spend, currencyCode)}</span>
        </div>
        <div className="rounded-xl px-3 py-2.5 flex flex-col gap-0.5" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <span className="text-[10.5px] font-medium opacity-70 tracking-wide">↓ IN</span>
          <span className="font-mono font-semibold text-[15px]">{formatAmountShort(earn, currencyCode)}</span>
        </div>
      </div>
    </div>
  );
}
