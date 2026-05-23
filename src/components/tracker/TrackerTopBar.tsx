import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UploadSimple } from '@phosphor-icons/react';

interface Props {
  trackerId: string;
  trackerName: string;
  memberCount: number;
}

/**
 * Publishes the measured height to `--tracker-topbar-h` on documentElement so the
 * sibling sticky TabBar can offset against it without a hard-coded magic number.
 * The CSS var is cleared on unmount to avoid bleeding into other routes.
 */
function useTopBarHeight(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (h: number) => {
      document.documentElement.style.setProperty('--tracker-topbar-h', `${Math.round(h)}px`);
    };
    apply(el.getBoundingClientRect().height);
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) apply(entry.contentRect.height);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--tracker-topbar-h');
    };
  }, [ref]);
}

export default function TrackerTopBar({ trackerId, trackerName, memberCount }: Props) {
  const navigate = useNavigate();
  const barRef = useRef<HTMLDivElement | null>(null);
  useTopBarHeight(barRef);
  return (
    <div ref={barRef} className="sticky top-0 z-20 px-4 py-2.5 bg-background/95 backdrop-blur-md border-b border-line-soft">
      <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
        <button
          aria-label="Back"
          onClick={() => navigate('/')}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-card border border-line-soft text-ink"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex flex-col items-center min-w-0 flex-1">
          <span className="font-display font-semibold text-[17px] text-ink truncate max-w-full">
            {trackerName}
          </span>
          <span className="flex items-center gap-1.5 text-[10.5px] text-ink-faint font-medium">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-earn" />
            {memberCount} member{memberCount !== 1 ? 's' : ''}
          </span>
        </div>

        <button
          aria-label="Upload statement"
          onClick={() => navigate(`/tracker/${trackerId}/upload`)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-card border border-line-soft text-ink"
        >
          <UploadSimple size={17} />
        </button>
      </div>
    </div>
  );
}
