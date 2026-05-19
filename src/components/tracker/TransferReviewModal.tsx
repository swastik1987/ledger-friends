import { ArrowLeftRight } from 'lucide-react';
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
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-2">
            <ArrowLeftRight className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <AlertDialogTitle className="text-center">
            {count} possible internal transfer{count !== 1 ? 's' : ''} found
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Some transactions look like money moving between your own accounts (NEFT/IMPS/UPI to self, credit card bill payments, wallet top-ups, etc.). Review them to keep your spending and income totals accurate.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse sm:flex-col-reverse gap-2">
          <AlertDialogCancel onClick={onDismiss} className="mt-0">
            Dismiss
          </AlertDialogCancel>
          <AlertDialogAction onClick={onReview}>
            Review {count} transaction{count !== 1 ? 's' : ''}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
