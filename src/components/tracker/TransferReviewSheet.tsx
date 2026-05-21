import { useEffect, useMemo, useState } from 'react';
import { Check, X, Minus, ArrowDownLeft, ArrowUpRight } from '@phosphor-icons/react';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import CategoryDot from '@/components/CategoryDot';
import { Expense } from '@/types';
import { formatAmountShort } from '@/lib/currencies';
import { useBulkResolveTransfers } from '@/hooks/useExpenses';
import { format, parseISO } from 'date-fns';

type Decision = 'skip' | 'transfer' | 'not_transfer';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackerId: string;
  trackerCurrency: string;
  suspectedExpenses: Expense[];
}

export default function TransferReviewSheet({ open, onOpenChange, trackerId, trackerCurrency, suspectedExpenses }: Props) {
  const resolve = useBulkResolveTransfers();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const sortedExpenses = useMemo(
    () => [...suspectedExpenses].sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return b.date.localeCompare(a.date);
    }),
    [suspectedExpenses]
  );

  useEffect(() => {
    if (open) {
      const initial: Record<string, Decision> = {};
      sortedExpenses.forEach(e => { initial[e.id] = 'skip'; });
      setDecisions(initial);
    }
  }, [open, sortedExpenses]);

  const counts = useMemo(() => {
    const c = { transfer: 0, not_transfer: 0, skip: 0 };
    Object.values(decisions).forEach(d => { c[d]++; });
    return c;
  }, [decisions]);

  const hasChanges = counts.transfer > 0 || counts.not_transfer > 0;

  const setDecision = (id: string, decision: Decision) => {
    setDecisions(prev => ({ ...prev, [id]: decision }));
  };

  const setAll = (decision: Decision) => {
    const next: Record<string, Decision> = {};
    sortedExpenses.forEach(e => { next[e.id] = decision; });
    setDecisions(next);
  };

  const requestClose = () => {
    if (hasChanges) setShowLeaveConfirm(true);
    else onOpenChange(false);
  };

  const handleSave = async () => {
    const confirmedIds: string[] = [];
    const rejectedIds: string[] = [];
    sortedExpenses.forEach(e => {
      const d = decisions[e.id] || 'skip';
      if (d === 'transfer') confirmedIds.push(e.id);
      else if (d === 'not_transfer') rejectedIds.push(e.id);
    });
    if (confirmedIds.length === 0 && rejectedIds.length === 0) {
      onOpenChange(false);
      return;
    }
    await resolve.mutateAsync({ trackerId, confirmedIds, rejectedIds });
    onOpenChange(false);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) { requestClose(); return; }
          onOpenChange(next);
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-3xl h-[92dvh] flex flex-col p-0 border-0"
          style={{ background: 'hsl(var(--background))' }}
        >
          <div className="mx-auto w-9 h-1 rounded-full bg-line mt-2 mb-2" />

          <div className="px-5 pt-1 pb-3">
            <h2 className="font-display font-semibold text-[19px] text-ink" style={{ letterSpacing: '-0.02em' }}>
              Review possible transfers
            </h2>
            <p className="text-[12px] text-ink-soft mt-1">
              Mark each transaction as Transfer, Not Transfer, or leave as Skip to decide later.
            </p>
            <div className="flex items-center gap-1.5 pt-3 flex-wrap">
              <button
                type="button"
                onClick={() => setAll('transfer')}
                className="text-[11px] px-2.5 py-1 rounded-md font-semibold"
                style={{ background: 'hsl(var(--warn-bg))', color: 'hsl(var(--warn))' }}
              >
                All Transfer
              </button>
              <button
                type="button"
                onClick={() => setAll('not_transfer')}
                className="text-[11px] px-2.5 py-1 rounded-md font-semibold bg-chip text-ink-soft"
              >
                All Not Transfer
              </button>
              <button
                type="button"
                onClick={() => setAll('skip')}
                className="text-[11px] px-2.5 py-1 rounded-md font-semibold bg-muted text-ink-soft"
              >
                Reset to Skip
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5">
            {sortedExpenses.length === 0 && (
              <p className="text-center text-sm text-ink-soft py-8">No transactions to review.</p>
            )}
            {sortedExpenses.map(exp => {
              const decision = decisions[exp.id] || 'skip';
              const isCredit = !exp.is_debit;
              const cat = exp.category;
              const containerStyle =
                decision === 'transfer'
                  ? { background: 'hsl(var(--warn) / 0.10)', borderColor: 'hsl(var(--warn) / 0.50)' }
                  : decision === 'not_transfer'
                    ? { background: 'hsl(var(--chip-bg))', borderColor: 'hsl(var(--line))' }
                    : { background: 'hsl(var(--card))', borderColor: 'hsl(var(--line-soft))' };
              return (
                <div
                  key={exp.id}
                  className="rounded-2xl border p-3 transition-colors"
                  style={containerStyle}
                >
                  <div className="flex items-start gap-3">
                    <CategoryDot icon={cat?.icon || 'Tag'} color={cat?.color || 'hsl(var(--ember))'} size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-[14px] text-ink truncate" style={{ letterSpacing: '-0.01em' }}>
                        {exp.merchant_name || exp.description}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-soft mt-0.5 font-medium">
                        <span>{format(parseISO(exp.date), 'd MMM yyyy')}</span>
                        {exp.bank_name && <span>· {exp.bank_name}</span>}
                      </div>
                    </div>
                    <div
                      className="text-right shrink-0 inline-flex items-center gap-0.5 font-mono font-semibold text-[14px] tabular-nums"
                      style={{ color: isCredit ? 'hsl(var(--earn))' : 'hsl(var(--ink))' }}
                    >
                      {isCredit
                        ? <ArrowDownLeft size={11} weight="bold" />
                        : <ArrowUpRight size={11} weight="bold" />}
                      {isCredit ? '+' : ''}{formatAmountShort(exp.amount, exp.currency || trackerCurrency)}
                    </div>
                  </div>

                  {/* Tri-state segmented control */}
                  <div className="grid grid-cols-3 gap-1.5 mt-3">
                    <TriBtn active={decision === 'transfer'} tone="warn" onClick={() => setDecision(exp.id, 'transfer')}>
                      <Check size={13} weight="bold" /> Transfer
                    </TriBtn>
                    <TriBtn active={decision === 'not_transfer'} tone="neutral" onClick={() => setDecision(exp.id, 'not_transfer')}>
                      <X size={13} weight="bold" /> Not Transfer
                    </TriBtn>
                    <TriBtn active={decision === 'skip'} tone="muted" onClick={() => setDecision(exp.id, 'skip')}>
                      <Minus size={13} weight="bold" /> Skip
                    </TriBtn>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-line-soft px-4 py-3 space-y-2 bg-background safe-bottom">
            <div className="flex items-center justify-between text-[11.5px] text-ink-soft font-medium">
              <span>{counts.transfer} transfer{counts.transfer !== 1 ? 's' : ''}</span>
              <span>{counts.not_transfer} not transfer{counts.not_transfer !== 1 ? 's' : ''}</span>
              <span>{counts.skip} skipped</span>
            </div>
            <button
              onClick={handleSave}
              disabled={resolve.isPending || !hasChanges}
              className="w-full h-11 rounded-xl bg-ember text-white font-bold text-[14px] disabled:opacity-50 inline-flex items-center justify-center"
              style={hasChanges ? { boxShadow: '0 6px 18px hsl(var(--ember) / 0.40)' } : undefined}
            >
              {resolve.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : hasChanges
                  ? `Save (${counts.transfer + counts.not_transfer} changes)`
                  : 'Nothing to save'}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You marked {counts.transfer + counts.not_transfer} transaction{counts.transfer + counts.not_transfer !== 1 ? 's' : ''}. Closing now will discard your selections.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Reviewing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowLeaveConfirm(false); onOpenChange(false); }}
              className="bg-spend text-white hover:bg-spend/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TriBtn({
  active, tone, onClick, children,
}: {
  active: boolean;
  tone: 'warn' | 'neutral' | 'muted';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const styles = active
    ? tone === 'warn'
      ? { background: 'hsl(var(--warn) / 0.15)', color: 'hsl(var(--warn))', borderColor: 'hsl(var(--warn))' }
      : tone === 'neutral'
        ? { background: 'hsl(var(--chip-bg))', color: 'hsl(var(--ink))', borderColor: 'hsl(var(--ink) / 0.40)' }
        : { background: 'hsl(var(--muted))', color: 'hsl(var(--ink))', borderColor: 'hsl(var(--ink) / 0.30)' }
    : { background: 'hsl(var(--card))', color: 'hsl(var(--ink-soft))', borderColor: 'hsl(var(--line))' };
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11.5px] font-semibold border-2 transition-colors"
      style={styles}
    >
      {children}
    </button>
  );
}
