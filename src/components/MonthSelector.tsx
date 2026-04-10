/**
 * MonthSelector — a primary-coloured calendar chip that replaces
 * the plain Select dropdown for month navigation.
 * Shows: [←]  [📅 Month Label ▾]  [→]
 * Clicking the pill opens a Popover with the full month list.
 */
import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check } from 'lucide-react';

interface MonthSelectorProps {
  month: string;
  months: { value: string; label: string }[];
  onMonthChange: (m: string) => void;
  className?: string;
}

export default function MonthSelector({ month, months, onMonthChange, className }: MonthSelectorProps) {
  const [open, setOpen] = useState(false);
  const currentLabel = months.find(m => m.value === month)?.label ?? month;
  const currentIdx = months.findIndex(m => m.value === month);

  const goPrev = () => {
    if (month === 'all') return;
    // "all" is idx 0; idx 1 is newest; higher idx = older month
    if (currentIdx >= 0 && currentIdx < months.length - 1) {
      onMonthChange(months[currentIdx + 1].value);
    }
  };

  const goNext = () => {
    if (month === 'all') return;
    if (currentIdx > 1) onMonthChange(months[currentIdx - 1].value);
  };

  const atOldest = month === 'all' || currentIdx === months.length - 1;
  const atNewest = month === 'all' || currentIdx === 1;

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      {/* ← older */}
      <button
        onClick={goPrev}
        disabled={atOldest}
        className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 shrink-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Calendar chip — opens month list */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm min-w-0">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{currentLabel}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" sideOffset={8} className="w-48 p-1">
          <div className="max-h-64 overflow-y-auto">
            {months.map(m => (
              <button
                key={m.value}
                onClick={() => { onMonthChange(m.value); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  m.value === month
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                <span>{m.label}</span>
                {m.value === month && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* → newer */}
      <button
        onClick={goNext}
        disabled={atNewest}
        className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 shrink-0"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
