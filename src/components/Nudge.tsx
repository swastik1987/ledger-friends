import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type NudgePosition = 'top' | 'bottom' | 'left' | 'right';

interface NudgeProps {
  show: boolean;
  onDismiss: () => void;
  message: string;
  /** Position of the tooltip relative to the anchor/children */
  position?: NudgePosition;
  /** Auto-dismiss after this many ms (default 8000, 0 = no auto) */
  autoHideMs?: number;
}

export default function Nudge({ show, onDismiss, message, position = 'bottom', autoHideMs = 8000 }: NudgeProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!show || autoHideMs <= 0) return;
    timerRef.current = setTimeout(onDismiss, autoHideMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [show, autoHideMs, onDismiss]);

  if (!show) return null;

  // Arrow classes based on position
  const arrowMap: Record<NudgePosition, string> = {
    bottom: 'bottom-full left-1/2 -translate-x-1/2 mb-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-slate-800',
    top: 'top-full left-1/2 -translate-x-1/2 mt-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-800',
    left: 'left-full top-1/2 -translate-y-1/2 ml-0 border-t-[6px] border-b-[6px] border-l-[6px] border-t-transparent border-b-transparent border-l-slate-800',
    right: 'right-full top-1/2 -translate-y-1/2 mr-0 border-t-[6px] border-b-[6px] border-r-[6px] border-t-transparent border-b-transparent border-r-slate-800',
  };

  const positionMap: Record<NudgePosition, string> = {
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <>
      {/* Invisible backdrop to dismiss on outside tap */}
      <div className="fixed inset-0 z-[998]" onClick={onDismiss} />
      <div className={`absolute z-[999] ${positionMap[position]} animate-in fade-in slide-in-from-bottom-1 duration-300`}>
        <div className="relative bg-slate-800 text-white rounded-xl px-3 py-2.5 shadow-lg max-w-[260px] min-w-[180px]">
          {/* Arrow */}
          <div className={`absolute w-0 h-0 ${arrowMap[position]}`} />
          <div className="flex items-start gap-2">
            <p className="text-xs leading-relaxed flex-1">{message}</p>
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
              className="shrink-0 p-0.5 rounded-full hover:bg-white/20 transition-colors -mt-0.5 -mr-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="text-[10px] font-medium text-indigo-300 hover:text-indigo-200 mt-1"
          >
            Got it
          </button>
        </div>
      </div>
    </>
  );
}
