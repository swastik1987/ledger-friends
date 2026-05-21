import { format } from 'date-fns';
import { Pencil, Trash, ArrowDownLeft, Check } from '@phosphor-icons/react';
import CategoryDot from '@/components/CategoryDot';
import { Expense } from '@/types';
import { formatAmountShort } from '@/lib/currencies';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Props {
  expense: Expense;
  trackerCurrency: string;
  selectMode: boolean;
  selected: boolean;
  canModify: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onLongPressStart: (id: string) => void;
  onLongPressCancel: () => void;
  onClick: (e: Expense) => void;
}

function paymentClass(method: string) {
  switch (method) {
    case 'UPI': return 'bg-[hsl(var(--ember)/0.10)] text-ember';
    case 'Credit Card': return 'bg-[hsl(var(--earn)/0.10)] text-earn';
    case 'Debit Card': return 'bg-[hsl(var(--earn)/0.08)] text-earn';
    case 'Online': return 'bg-[hsl(var(--warn)/0.12)] text-warn';
    case 'Cash': return 'bg-chip text-ink';
    default: return 'bg-chip text-ink-soft';
  }
}

export default function TxnRow({
  expense, trackerCurrency, selectMode, selected, canModify,
  onSelect, onEdit, onDelete, onLongPressStart, onLongPressCancel, onClick,
}: Props) {
  const isCredit = !expense.is_debit;
  const cat = expense.category;
  const amountColor = isCredit ? 'hsl(var(--earn))' : 'hsl(var(--ink))';

  return (
    <div
      className="mx-4 mb-2 rounded-2xl transition-colors animate-stagger"
      style={{
        background: selected ? 'hsl(var(--ember) / 0.10)' : expense.is_transfer ? 'hsl(var(--warn) / 0.06)' : 'hsl(var(--card))',
        border: '1px solid ' + (selected ? 'hsl(var(--ember) / 0.55)' : expense.is_transfer ? 'hsl(var(--warn) / 0.30)' : 'hsl(var(--line-soft))'),
        opacity: expense.is_transfer ? 0.85 : 1,
      }}
      onPointerDown={() => onLongPressStart(expense.id)}
      onPointerUp={onLongPressCancel}
      onPointerLeave={onLongPressCancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        onClick={() => onClick(expense)}
        className="w-full text-left p-3"
      >
        <div className="flex items-center gap-3">
          {selectMode && (
            <span
              onClick={(e) => { e.stopPropagation(); onSelect(expense.id); }}
              className="inline-flex items-center justify-center rounded-md shrink-0"
              style={{
                width: 20, height: 20,
                border: '1.8px solid ' + (selected ? 'hsl(var(--ember))' : 'hsl(var(--line))'),
                background: selected ? 'hsl(var(--ember))' : 'transparent',
                color: '#fff',
              }}
            >
              {selected && <Check size={13} weight="bold" />}
            </span>
          )}

          <CategoryDot icon={cat?.icon || 'Tag'} color={cat?.color || 'hsl(var(--ember))'} size={40} />

          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-[15px] text-ink truncate" style={{ letterSpacing: '-0.01em' }}>
              {expense.merchant_name || expense.description}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-soft font-medium">
              {cat && (
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block rounded-full" style={{ width: 6, height: 6, background: cat.color }} />
                  {cat.name}
                </span>
              )}
              {expense.payment_method && (
                <>
                  <span className="opacity-40">·</span>
                  <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold ${paymentClass(expense.payment_method)}`}>
                    {expense.payment_method}
                  </span>
                </>
              )}
              {expense.is_transfer && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold bg-warn/15 text-warn">
                    ↔ Transfer
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="inline-flex items-center justify-end gap-0.5 font-mono font-semibold text-[15px]" style={{ color: amountColor }}>
              {isCredit && <ArrowDownLeft size={11} weight="bold" />}
              {isCredit ? '+' : ''}{formatAmountShort(expense.amount, trackerCurrency)}
            </div>
            <p className="text-[10.5px] text-ink-faint font-medium mt-0.5">
              {expense.created_by_profile?.full_name?.split(' ')[0] || expense.created_by_name?.split(' ')[0] || 'Deleted'}
            </p>
          </div>
        </div>

        {!selectMode && (expense.description !== expense.merchant_name && expense.description) && (
          <div className="mt-2 pl-[52px] flex items-start gap-2">
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-[13px] text-ink-soft text-left truncate">{expense.description}</p>
              {expense.notes && (
                <p className="text-[11px] text-ink-faint text-left line-clamp-2">{expense.notes}</p>
              )}
              {expense.conversion_note && (
                <p className="text-[11px] text-ink-faint text-left italic">{expense.conversion_note}</p>
              )}
            </div>
            {canModify && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(expense.id); }}
                  className="p-1.5 rounded-full text-ink-faint hover:text-ember hover:bg-ember/10 transition-colors"
                >
                  <Pencil size={13} />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-full text-ink-faint hover:text-spend hover:bg-spend/10 transition-colors"
                    >
                      <Trash size={13} />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete &quot;{expense.description}&quot;.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(expense.id)}
                        className="bg-spend text-white hover:bg-spend/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        )}
      </button>
    </div>
  );
}
