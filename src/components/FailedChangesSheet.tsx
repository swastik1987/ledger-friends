import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowsClockwise, CircleNotch, Trash, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { OFFLINE_MESSAGE } from '@/lib/platform';
import { formatAmountShort } from '@/lib/currencies';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const outbox = () => import('@/lib/local/outbox');

/**
 * Android app only: the changes the server rejected (an RLS denial after being
 * removed from a tracker, a category deleted elsewhere, …). Editing a listed
 * transaction also resends it; this sheet offers the bulk options.
 */
export default function FailedChangesSheet({ open, onOpenChange }: Props) {
  const [busy, setBusy] = useState<'retry' | 'discard' | null>(null);
  const { data: changes = [] } = useQuery({
    queryKey: ['sync-failed-changes'],
    queryFn: async () => (await outbox()).readFailedChanges(),
    enabled: open,
  });

  const run = async (kind: 'retry' | 'discard') => {
    if (!navigator.onLine) {
      toast.error(OFFLINE_MESSAGE);
      return;
    }
    setBusy(kind);
    try {
      if (kind === 'retry') {
        await (await outbox()).retryFailed();
        toast.success('Sending again…');
      } else {
        const n = await (await outbox()).discardFailed();
        toast.success(`Discarded ${n} change${n === 1 ? '' : 's'}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl max-h-[85dvh] flex flex-col p-0 border-0"
        style={{ background: 'hsl(var(--background))' }}
      >
        <div className="mx-auto w-9 h-1 rounded-full bg-line mt-2 mb-2" />
        <div className="px-5 pt-1 pb-3">
          <SheetTitle className="font-display font-semibold text-[19px] text-ink" style={{ letterSpacing: '-0.02em' }}>
            Changes that couldn't sync
          </SheetTitle>
          <SheetDescription className="text-[12px] text-ink-soft mt-1">
            The server rejected these. Fix a transaction by editing it, which sends it again, or retry or discard them all here.
          </SheetDescription>
        </div>

        <div className="flex-1 overflow-y-auto px-5 space-y-2 pb-3">
          {changes.map(c => (
            <div key={c.id} className="rounded-2xl bg-card border border-line-soft p-3">
              <div className="flex items-start gap-2">
                <WarningCircle size={16} className="text-spend shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold text-sm text-ink truncate">{c.description}</p>
                    {c.amount !== null && <p className="font-mono text-sm text-ink shrink-0">{formatAmountShort(c.amount, c.currency)}</p>}
                  </div>
                  <p className="text-[11px] text-ink-faint">
                    {c.isDelete ? 'Delete' : c.isNew ? 'New transaction' : 'Edit'}
                    {c.date && ` · ${format(new Date(`${c.date}T00:00:00`), 'd MMM yyyy')}`}
                  </p>
                  {c.error && <p className="text-[11px] text-spend mt-1 break-words">{c.error}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 pb-5 pt-2 grid grid-cols-2 gap-2 border-t border-line-soft">
          <button
            type="button"
            disabled={!!busy || changes.length === 0}
            onClick={() => void run('discard')}
            className="h-11 rounded-xl border border-line bg-card text-sm font-semibold text-spend inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy === 'discard' ? <CircleNotch size={16} className="animate-spin" /> : <Trash size={16} />}
            Discard all
          </button>
          <button
            type="button"
            disabled={!!busy || changes.length === 0}
            onClick={() => void run('retry')}
            className="h-11 rounded-xl bg-ember text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy === 'retry' ? <CircleNotch size={16} className="animate-spin" /> : <ArrowsClockwise size={16} />}
            Retry all
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
