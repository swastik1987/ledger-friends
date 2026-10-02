import { CloudSlash, CircleNotch } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

/** Passed to tabs when their data failed to load with nothing cached; null otherwise. */
export interface LoadErrorState {
  onRetry: () => void;
  retrying: boolean;
}

interface Props {
  /** What failed to load, completing "Couldn't load …" — e.g. "your trackers". */
  what: string;
  onRetry: () => void;
  /** True while the retry is in flight. */
  retrying?: boolean;
  /** Small inline card (for list sections) instead of the full empty-state block. */
  compact?: boolean;
  /** Optional secondary action shown under "Try again" (full variant only). */
  secondaryAction?: { label: string; onClick: () => void };
}

/**
 * Shown when a query fails and there's no cached data to fall back on.
 * Without it, pages fall through to their empty state and tell users who do
 * have data that they have none ("No trackers yet — Create My First Tracker").
 */
export default function LoadError({ what, onRetry, retrying = false, compact = false, secondaryAction }: Props) {
  const retry = (
    <Button
      variant="outline"
      size={compact ? 'sm' : 'default'}
      onClick={onRetry}
      disabled={retrying}
      className={compact ? 'gap-2' : 'h-11 gap-2'}
    >
      {retrying && <CircleNotch className="h-4 w-4 animate-spin" />}
      Try again
    </Button>
  );

  if (compact) {
    return (
      <div role="alert" className="rounded-xl bg-card border border-border p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load {what}. Check your connection.</p>
        {retry}
      </div>
    );
  }

  return (
    <div role="alert" className="text-center py-16 px-4 animate-fade-in-up">
      <CloudSlash size={64} color="hsl(var(--ink-faint) / 0.45)" className="mx-auto mb-4" />
      <p className="font-display font-semibold text-lg text-ink">Couldn&apos;t load {what}</p>
      <p className="text-sm text-ink-soft mb-4">Check your connection and try again. Your data is safe.</p>
      {retry}
      {secondaryAction && (
        <button onClick={secondaryAction.onClick} className="block mx-auto mt-3 text-sm font-medium text-ink-soft">
          {secondaryAction.label}
        </button>
      )}
    </div>
  );
}
