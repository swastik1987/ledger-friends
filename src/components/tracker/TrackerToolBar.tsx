import { useState } from 'react';
import { CaretDown, Calendar, FunnelSimple, ArrowsDownUp, ArrowsLeftRight, Check } from '@phosphor-icons/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export type SortOption = 'date-desc' | 'date-asc' | 'category-asc' | 'category-desc';

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date-desc', label: 'Date (Newest first)' },
  { value: 'date-asc', label: 'Date (Oldest first)' },
  { value: 'category-asc', label: 'Category (A → Z)' },
  { value: 'category-desc', label: 'Category (Z → A)' },
];

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
            style={sort !== 'date-desc' ? { color: 'hsl(var(--ember))', borderColor: 'hsl(var(--ember))' } : undefined}
            aria-label="Sort"
          >
            <ArrowsDownUp size={17} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-56 p-1">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onSortChange(opt.value); setSortOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-muted text-foreground"
              style={sort === opt.value ? { background: 'hsl(var(--ember) / 0.10)', color: 'hsl(var(--ember))', fontWeight: 600 } : undefined}
            >
              <span className="flex-1 text-left">{opt.label}</span>
              {sort === opt.value && <Check size={14} color="hsl(var(--ember))" />}
            </button>
          ))}
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
