import CategoryDot from '@/components/CategoryDot';
import { Category } from '@/types';

interface Props {
  label: string;
  netLabel: string;
  netClass?: 'pos' | 'neg' | 'neutral';
  category?: Category | null;
}

export default function DayHeader({ label, netLabel, netClass = 'neutral', category }: Props) {
  const color =
    netClass === 'pos' ? 'hsl(var(--earn))'
    : netClass === 'neg' ? 'hsl(var(--spend))'
    : 'hsl(var(--ink-faint))';
  return (
    <div className="mx-4 mt-2 mb-1.5 flex items-baseline justify-between">
      <div className="inline-flex items-center gap-2">
        {category && <CategoryDot icon={category.icon} color={category.color} size={20} />}
        <span className="font-display font-semibold text-[13px] text-ink" style={{ letterSpacing: '-0.01em' }}>
          {label}
        </span>
      </div>
      <span className="font-mono font-medium text-[11px] tabular-nums" style={{ color }}>
        {netLabel}
      </span>
    </div>
  );
}
