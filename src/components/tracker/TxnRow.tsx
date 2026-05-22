import { useRef, useState, useCallback, useEffect } from 'react';
import { ArrowDownLeft, Check, Trash } from '@phosphor-icons/react';
import CategoryDot from '@/components/CategoryDot';
import { Expense } from '@/types';
import { formatAmountShort } from '@/lib/currencies';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
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
}

// Gesture thresholds
const TAP_MAX_MOVE = 8;        // px — movement under which a pointerup counts as a tap
const TAP_MAX_TIME = 250;      // ms — maximum tap duration
const SCROLL_LOCK_Y = 12;      // px — vertical movement past this aborts horizontal swipe
const SWIPE_THRESHOLD = 0.40;  // fraction of card width — past this fires delete
const SWIPE_VISUAL_CAP = 140;  // px — clamp visual translateX

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
  onSelect, onEdit, onDelete, onLongPressStart, onLongPressCancel,
}: Props) {
  const isCredit = !expense.is_debit;
  const cat = expense.category;
  const amountColor = isCredit ? 'hsl(var(--earn))' : 'hsl(var(--ink))';

  // Gesture state
  const cardRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number; t: number; pointerId: number } | null>(null);
  const verticalLockedRef = useRef(false);  // user is scrolling; ignore further horizontal moves
  const longPressFiredRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [translateX, setTranslateX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Description text: prefer description if it differs from merchant
  const hasDistinctDescription =
    !!expense.description && expense.description !== expense.merchant_name;

  // ── Pointer handlers ──
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    onLongPressCancel();
  }, [onLongPressCancel]);

  const reset = useCallback(() => {
    setDragging(false);
    setTranslateX(0);
    verticalLockedRef.current = false;
    longPressFiredRef.current = false;
    startRef.current = null;
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore mouse right-click and middle-click
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), pointerId: e.pointerId };
    verticalLockedRef.current = false;
    longPressFiredRef.current = false;
    setTranslateX(0);

    // Start long-press timer (500ms) for multi-select
    if (!selectMode) {
      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        onLongPressStart(expense.id);
      }, 500);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== e.pointerId) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    // Any meaningful movement cancels long-press
    if (Math.abs(dx) > TAP_MAX_MOVE || Math.abs(dy) > TAP_MAX_MOVE) {
      cancelLongPress();
    }

    // Vertical scroll wins: lock out horizontal handling
    if (!verticalLockedRef.current && Math.abs(dy) > SCROLL_LOCK_Y && Math.abs(dy) > Math.abs(dx)) {
      verticalLockedRef.current = true;
      setDragging(false);
      setTranslateX(0);
      return;
    }
    if (verticalLockedRef.current) return;

    // Only allow horizontal drag if user can modify and not in select mode
    if (!canModify || selectMode) return;

    // Engage drag once movement is unambiguously horizontal
    if (!dragging && Math.abs(dx) > TAP_MAX_MOVE && Math.abs(dx) > Math.abs(dy)) {
      setDragging(true);
      try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }

    if (dragging || Math.abs(dx) > TAP_MAX_MOVE) {
      // Clamp visual translation
      const clamped = Math.max(-SWIPE_VISUAL_CAP, Math.min(SWIPE_VISUAL_CAP, dx));
      setTranslateX(clamped);
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start || start.pointerId !== e.pointerId) return;

    cancelLongPress();

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dt = Date.now() - start.t;
    const wasDragging = dragging;
    const wasLongPressFired = longPressFiredRef.current;
    const wasVerticalLocked = verticalLockedRef.current;

    // Release pointer capture
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    setDragging(false);
    setTranslateX(0);

    // Multi-select toggle: any tap-like gesture toggles selection
    if (selectMode) {
      const moved = Math.abs(dx) > TAP_MAX_MOVE || Math.abs(dy) > TAP_MAX_MOVE;
      if (!moved && dt < TAP_MAX_TIME * 2) {
        onSelect(expense.id);
      }
      reset();
      return;
    }

    // Long-press already entered select mode; don't treat as tap
    if (wasLongPressFired) {
      reset();
      return;
    }

    // Vertical scroll: nothing else fires
    if (wasVerticalLocked) {
      reset();
      return;
    }

    // Swipe-delete: horizontal distance past threshold of card width
    if (canModify && wasDragging) {
      const width = cardRef.current?.offsetWidth || 320;
      if (Math.abs(dx) >= width * SWIPE_THRESHOLD) {
        setConfirmDelete(true);
        reset();
        return;
      }
    }

    // Tap: short, no/low movement → open Edit
    if (canModify && Math.abs(dx) <= TAP_MAX_MOVE && Math.abs(dy) <= TAP_MAX_MOVE && dt < TAP_MAX_TIME) {
      onEdit(expense.id);
    }

    reset();
  };

  // Clean up pending long-press if unmounted mid-press
  useEffect(() => () => { cancelLongPress(); }, [cancelLongPress]);

  // ── Render ──
  const showSwipeHint = dragging && Math.abs(translateX) > TAP_MAX_MOVE;
  const swipeDir = translateX < 0 ? 'left' : 'right';

  return (
    <div className="relative mx-4 mb-2">
      {/* Red delete-hint background, revealed by translation */}
      {showSwipeHint && (
        <div
          className="absolute inset-0 rounded-2xl flex items-center px-5"
          style={{
            background: 'hsl(var(--spend))',
            color: '#fff',
            justifyContent: swipeDir === 'left' ? 'flex-end' : 'flex-start',
          }}
          aria-hidden
        >
          <span className="inline-flex items-center gap-1.5 font-semibold text-[13px]">
            <Trash size={16} weight="bold" /> Delete
          </span>
        </div>
      )}

      <div
        ref={cardRef}
        role={canModify ? 'button' : undefined}
        tabIndex={canModify && !selectMode ? 0 : -1}
        onKeyDown={(e) => {
          if (selectMode || !canModify) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onEdit(expense.id);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={(e) => e.preventDefault()}
        className="relative rounded-2xl animate-stagger select-none"
        style={{
          background: selected ? 'hsl(var(--ember) / 0.10)' : expense.is_transfer ? 'hsl(var(--warn) / 0.06)' : 'hsl(var(--card))',
          border: '1px solid ' + (selected ? 'hsl(var(--ember) / 0.55)' : expense.is_transfer ? 'hsl(var(--warn) / 0.30)' : 'hsl(var(--line-soft))'),
          opacity: expense.is_transfer ? 0.9 : 1,
          transform: `translateX(${translateX}px)`,
          transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1)',
          touchAction: 'pan-y',  // allow vertical scroll, intercept horizontal
          cursor: canModify && !selectMode ? 'pointer' : 'default',
        }}
      >
        <div className="p-3">
          {/* Row 1: dot, merchant, amount */}
          <div className="flex items-center gap-3">
            {selectMode && (
              <span
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
              <p
                className="font-display font-semibold text-[15px] text-ink truncate"
                style={{ letterSpacing: '-0.01em' }}
              >
                {expense.merchant_name || expense.description}
              </p>

              {/* Row 2: category · transfer chip */}
              <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-soft font-medium flex-wrap">
                {cat && (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="inline-block rounded-full"
                      style={{ width: 6, height: 6, background: cat.color }}
                    />
                    {cat.name}
                  </span>
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
              <div
                className="inline-flex items-center justify-end gap-0.5 font-mono font-semibold text-[15px] tabular-nums"
                style={{ color: amountColor }}
              >
                {isCredit && <ArrowDownLeft size={11} weight="bold" />}
                {isCredit ? '+' : ''}
                {formatAmountShort(expense.amount, trackerCurrency)}
              </div>
              <p className="text-[10.5px] text-ink-faint font-medium mt-0.5">
                {expense.created_by_profile?.full_name?.split(' ')[0] ||
                  expense.created_by_name?.split(' ')[0] ||
                  'Deleted'}
              </p>
            </div>
          </div>

          {/* Row 3: bank pill · payment chip. Only renders when at least one is present. */}
          {(expense.bank_name || expense.payment_method) && (
            <div className="mt-1.5 pl-[52px] flex items-center gap-1.5 flex-wrap">
              {expense.bank_name && (
                <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold bg-chip text-ink">
                  {expense.bank_name}
                </span>
              )}
              {expense.payment_method && (
                <span
                  className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-semibold ${paymentClass(
                    expense.payment_method,
                  )}`}
                >
                  {expense.payment_method}
                </span>
              )}
            </div>
          )}

          {/* Bottom block: description and conversion note — notes intentionally
              removed from the card per the latest spec; they still appear in the edit modal. */}
          {!selectMode && (hasDistinctDescription || expense.conversion_note) && (
            <div className="mt-2 pl-[52px] space-y-0.5">
              {hasDistinctDescription && (
                <p className="text-[13px] text-ink-soft text-left truncate">
                  {expense.description}
                </p>
              )}
              {expense.conversion_note && (
                <p className="text-[11px] text-ink-faint text-left italic">
                  {expense.conversion_note}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirm delete dialog — opens after a full swipe */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{expense.merchant_name || expense.description}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete(expense.id); setConfirmDelete(false); }}
              className="bg-spend text-white hover:bg-spend/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
