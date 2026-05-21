import { ArrowsLeftRight } from '@phosphor-icons/react';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onReview: () => void;
  onDismiss: () => void;
}

export default function TransferReviewModal({ open, onOpenChange, count, onReview, onDismiss }: Props) {
  if (count === 0) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-sm rounded-3xl border-line-soft"
        style={{ background: 'hsl(var(--card))' }}
      >
        <AlertDialogHeader>
          <div
            className="mx-auto flex items-center justify-center rounded-full mb-2"
            style={{
              width: 56, height: 56,
              background: 'hsl(var(--warn) / 0.15)',
              color: 'hsl(var(--warn))',
            }}
          >
            <ArrowsLeftRight size={26} weight="regular" />
          </div>
          <AlertDialogTitle
            className="text-center font-display font-semibold text-[20px] text-ink"
            style={{ letterSpacing: '-0.02em' }}
          >
            {count} possible internal transfer{count !== 1 ? 's' : ''} found
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-[13px] text-ink-soft leading-relaxed">
            Some transactions look like money moving between your own accounts (NEFT/IMPS/UPI to self, credit card bill payments, wallet top-ups). Review them to keep your spending and income totals accurate.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse sm:flex-col-reverse gap-2">
          <AlertDialogCancel
            onClick={onDismiss}
            className="mt-0 h-11 rounded-xl border-line text-ink bg-transparent hover:bg-muted"
          >
            Dismiss
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onReview}
            className="h-11 rounded-xl bg-ember text-white hover:bg-ember/90 font-semibold"
            style={{ boxShadow: '0 6px 18px hsl(var(--ember) / 0.40)' }}
          >
            Review {count} transaction{count !== 1 ? 's' : ''}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
