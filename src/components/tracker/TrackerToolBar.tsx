import { useState } from 'react';
import { CaretDown, Calendar, FunnelSimple, ArrowsDownUp, ArrowsLeftRight, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type SortField = 'date' | 'category' | 'amount';
export type SortDirection = 'asc' | 'desc';
export type SortOption = `${SortField}-${SortDirection}`;

export const DEFAULT_SORT: SortOption = 'date-desc';

const FIELD_OPTIONS: { id: SortField; label: string }[] = [
  { id: 'date', label: 'Date' },
  { id: 'category', label: 'Category' },
  { id: 'amount', label: 'Amount' },
];

// Phrasing for the current selection, shown as a single-line caption below the segments.
export function sortLabel(opt: SortOption): string {
  switch (opt) {
    case 'date-desc': return 'Newest first';
    case 'date-asc': return 'Oldest first';
    case 'category-asc': return 'A → Z';
    case 'category-desc': return 'Z → A';
    case 'amount-desc': return 'Highest first';
    case 'amount-asc': return 'Lowest first';
  }
}

export function parseSort(opt: SortOption): { field: SortField; direction: SortDirection } {
  const [field, direction] = opt.split('-') as [SortField, SortDirection];
  return { field, direction };
}

interface Props {
  monthLabel: string;
  months: { value: string; label: string }[];
  currentMonth: string;
  onMonthChange: (m: string) => void;
  sort: SortOption;
  onSortChange: (s: SortOption) => void;
  filterCount: number;
  onOpenFilter: () => void;
  transferCount: number;
  onOpenTransferReview: () => void;
}

export default function TrackerToolBar({
  monthLabel,
  months,
  currentMonth,
  onMonthChange,
  sort,
  onSortChange,
  filterCount,
  onOpenFilter,
  transferCount,
  onOpenTransferReview,
}: Props) {
  const [monthOpen, setMonthOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <div className="mx-4 mb-3 flex items-center gap-2">
      {/* Month dropdown */}
      <Popover open={monthOpen} onOpenChange={setMonthOpen}>
        <PopoverTrigger asChild>
          <button className="flex-1 min-w-0 px-3.5 h-[42px] rounded-xl border border-line bg-card text-ink inline-flex items-center justify-between gap-2 font-semibold text-[14px]">
            <span className="inline-flex items-center gap-2 min-w-0">
              <Calendar size={15} color="hsl(var(--ink-soft))" />
              <span className="truncate">{monthLabel}</span>
            </span>
            <CaretDown size={14} color="hsl(var(--ink-faint))" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-56 p-1">
          <div className="max-h-64 overflow-y-auto">
            {months.map(m => (
              <button
                key={m.value}
                onClick={() => { onMonthChange(m.value); setMonthOpen(false); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-muted text-foreground"
                style={m.value === currentMonth ? { background: 'hsl(var(--ember) / 0.10)', color: 'hsl(var(--ember))', fontWeight: 600 } : undefined}
              >
                <span>{m.label}</span>
                {m.value === currentMonth && <Check size={14} color="hsl(var(--ember))" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Transfer review */}
      {transferCount > 0 && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpenTransferReview}
                className="relative inline-flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-warn/40 bg-warn/10 text-warn"
                aria-label={`Review ${transferCount} possible transfers`}
              >
                <ArrowsLeftRight size={17} />
                <span
                  className="absolute -top-1 -right-1 inline-flex items-center justify-center text-[10px] font-bold rounded-full"
                  style={{
                    minWidth: 16, height: 16, padding: '0 4px',
                    background: 'hsl(var(--warn))', color: '#fff',
                    border: '1.5px solid hsl(var(--background))',
                  }}
                >
                  {transferCount}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Review {transferCount} possible transfer{transferCount !== 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Sort */}
      <Popover open={sortOpen} onOpenChange={setSortOpen}>
        <PopoverTrigger asChild>
          <button
            className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-xl border border-line bg-card text-ink"
            style={sort !== DEFAULT_SORT ? { color: 'hsl(var(--ember))', borderColor: 'hsl(var(--ember))' } : undefined}
            aria-label="Sort"
          >
            <ArrowsDownUp size={17} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-64 p-3 space-y-3">
          <SortControls value={sort} onChange={onSortChange} />
        </PopoverContent>
      </Popover>

      {/* Filter */}
      <button
        onClick={onOpenFilter}
        aria-label="Filter"
        className="relative inline-flex h-[42px] w-[42px] items-center justify-center rounded-xl"
        style={{
          border: '1px solid ' + (filterCount > 0 ? 'hsl(var(--ember))' : 'hsl(var(--line))'),
          background: filterCount > 0 ? 'hsl(var(--ember))' : 'hsl(var(--card))',
          color: filterCount > 0 ? '#fff' : 'hsl(var(--ink))',
        }}
      >
        <FunnelSimple size={17} />
        {filterCount > 0 && (
          <span
            className="absolute -top-1 -right-1 inline-flex items-center justify-center text-[10px] font-bold rounded-full"
            style={{
              width: 16, height: 16,
              background: 'hsl(var(--ink))', color: 'hsl(var(--background))',
              border: '1.5px solid hsl(var(--background))',
            }}
          >
            {filterCount}
          </span>
        )}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SortControls — field-pill row + direction-pill row.
// Two segmented controls instead of a 6-row list. Selecting a field preserves
// the current direction; switching direction keeps the current field.
// ─────────────────────────────────────────────────────────────────────────────
function SortControls({
  value,
  onChange,
}: {
  value: SortOption;
  onChange: (v: SortOption) => void;
}) {
  const { field, direction } = parseSort(value);

  const setField = (next: SortField) => onChange(`${next}-${direction}` as SortOption);
  const setDirection = (next: SortDirection) => onChange(`${field}-${next}` as SortOption);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">
          Sort by
        </div>
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface-alt border border-line-soft">
          {FIELD_OPTIONS.map(f => {
            const active = f.id === field;
            return (
              <button
                key={f.id}
                onClick={() => setField(f.id)}
                className="py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
                style={{
                  background: active ? 'hsl(var(--ink))' : 'transparent',
                  color: active ? 'hsl(var(--background))' : 'hsl(var(--ink-soft))',
                  letterSpacing: '-0.01em',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">
          Order
        </div>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-alt border border-line-soft">
          {([
            { id: 'asc' as const, label: 'Asc', Icon: ArrowUp },
            { id: 'desc' as const, label: 'Desc', Icon: ArrowDown },
          ]).map(d => {
            const active = d.id === direction;
            return (
              <button
                key={d.id}
                onClick={() => setDirection(d.id)}
                className="py-1.5 rounded-lg text-[12px] font-semibold inline-flex items-center justify-center gap-1 transition-colors"
                style={{
                  background: active ? 'hsl(var(--ink))' : 'transparent',
                  color: active ? 'hsl(var(--background))' : 'hsl(var(--ink-soft))',
                }}
              >
                <d.Icon size={12} weight="bold" />
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-ink-faint text-center">
        {sortLabel(value)}
      </p>
    </div>
  );
}
