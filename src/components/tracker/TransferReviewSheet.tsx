import { useEffect, useMemo, useState } from 'react';
import { Check, X, Minus, Loader2, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
import { Button } from '@/components/ui/button';
import CategoryIcon from '@/components/CategoryIcon';
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

  // Sort suspected expenses by amount descending (debit and credit treated equal — amounts
  // are stored as positive values regardless of is_debit direction). Date descending is the
  // tiebreaker so same-amount rows surface newest-first.
  const sortedExpenses = useMemo(
    () => [...suspectedExpenses].sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return b.date.localeCompare(a.date);
    }),
    [suspectedExpenses]
  );

  // Reset decisions when sheet opens or list changes
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
    if (hasChanges) {
      setShowLeaveConfirm(true);
    } else {
      onOpenChange(false);
    }
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
          if (!next) {
            requestClose();
            return;
          }
          onOpenChange(next);
        }}
      >
        <SheetContent side="bottom" className="rounded-t-2xl h-[92dvh] flex flex-col p-0">
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/40">
            <SheetTitle>Review possible transfers</SheetTitle>
            <p className="text-xs text-muted-foreground text-left">
              Mark each transaction as Transfer, Not Transfer, or leave as Skip to decide later.
            </p>

            {/* Bulk actions */}
            <div className="flex items-center gap-1.5 pt-2 flex-wrap">
              <button
                type="button"
                onClick={() => setAll('transfer')}
                className="text-[11px] px-2 py-1 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 font-medium"
              >
                All Transfer
              </button>
              <button
                type="button"
                onClick={() => setAll('not_transfer')}
                className="text-[11px] px-2 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 font-medium"
              >
                All Not Transfer
              </button>
              <button
                type="button"
                onClick={() => setAll('skip')}
                className="text-[11px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-muted/70 font-medium"
              >
                Reset to Skip
              </button>
            </div>
          </SheetHeader>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {sortedExpenses.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">No transactions to review.</p>
            )}
            {sortedExpenses.map(exp => {
              const decision = decisions[exp.id] || 'skip';
              return (
                <div
                  key={exp.id}
                  className={`rounded-2xl border p-3 transition-colors ${
                    decision === 'transfer'
                      ? 'bg-amber-50/50 border-amber-300 dark:bg-amber-950/20 dark:border-amber-800'
                      : decision === 'not_transfer'
                        ? 'bg-slate-50 border-slate-300 dark:bg-slate-900/40 dark:border-slate-700'
                        : 'bg-card border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {exp.category && (
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full shrink-0"
                        style={{ backgroundColor: exp.category.color + '20' }}
                      >
                        <CategoryIcon icon={exp.category.icon} color={exp.category.color} size={18} />
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{exp.description}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <span>{format(parseISO(exp.date), 'd MMM yyyy')}</span>
                        {exp.bank_name && <span>· {exp.bank_name}</span>}
                      </div>
                    </div>
                    <div className={`text-right shrink-0 font-mono text-sm font-semibold ${exp.is_debit ? 'text-slate-800 dark:text-slate-200' : 'text-emerald-600'}`}>
                      {exp.is_debit ? <ArrowUpRight className="inline h-3 w-3 mr-0.5" /> : <ArrowDownLeft className="inline h-3 w-3 mr-0.5" />}
                      {exp.is_debit ? '' : '+'}
                      {formatAmountShort(exp.amount, exp.currency || trackerCurrency)}
                    </div>
                  </div>

                  {/* Tri-state segmented control */}
                  <div className="grid grid-cols-3 gap-1.5 mt-3">
                    <button
                      type="button"
                      onClick={() => setDecision(exp.id, 'transfer')}
                      className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                        decision === 'transfer'
                          ? 'bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
                          : 'bg-card border-border text-muted-foreground hover:border-amber-300'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" /> Transfer
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecision(exp.id, 'not_transfer')}
                      className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                        decision === 'not_transfer'
                          ? 'bg-slate-200 border-slate-400 text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600'
                          : 'bg-card border-border text-muted-foreground hover:border-slate-400'
                      }`}
                    >
                      <X className="h-3.5 w-3.5" /> Not Transfer
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecision(exp.id, 'skip')}
                      className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                        decision === 'skip'
                          ? 'bg-muted border-muted-foreground/40 text-foreground'
                          : 'bg-card border-border text-muted-foreground hover:border-muted-foreground/40'
                      }`}
                    >
                      <Minus className="h-3.5 w-3.5" /> Skip
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-border/40 px-4 py-3 space-y-2 bg-background">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{counts.transfer} transfer{counts.transfer !== 1 ? 's' : ''}</span>
              <span>{counts.not_transfer} not transfer{counts.not_transfer !== 1 ? 's' : ''}</span>
              <span>{counts.skip} skipped</span>
            </div>
            <Button
              onClick={handleSave}
              disabled={resolve.isPending || !hasChanges}
              className="w-full h-11"
            >
              {resolve.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : hasChanges ? (
                `Save (${counts.transfer + counts.not_transfer} changes)`
              ) : (
                'Nothing to save'
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Discard-changes confirmation */}
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
