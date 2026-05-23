import { CaretLeft, CaretRight } from '@phosphor-icons/react';

interface Props {
  /** Tap handler for the older (left) direction. Falsy → no left button. */
  onPrev?: () => void;
  /** Tap handler for the newer (right) direction. Falsy → no right button. */
  onNext?: () => void;
  /** Color tone: 'dark' for ink-background cards (HeroSummary), 'light' for cream cards (Dashboard). */
  tone?: 'dark' | 'light';
}

/**
 * Subtle left/right chevron affordances sitting inside the parent card.
 *
 * They hint that the user can swipe horizontally to change month (and
 * also act as tap targets for the same action). Each side is hidden
 * when the current month is at the corresponding edge of the available
 * list — so when the user reaches the newest month the right chevron
 * quietly disappears.
 *
 * Designed to be ignorable: low opacity, no background, sized just
 * large enough for a fingertip. The parent card needs `position:
 * relative` (HeroSummary already has it; DashboardTab gets it added).
 */
export default function MonthNavChevrons({ onPrev, onNext, tone = 'dark' }: Props) {
  const color = tone === 'dark' ? '#FFFFFF' : 'hsl(var(--ink))';
  return (
    <>
      {onPrev && (
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous month"
          className="absolute inset-y-0 left-0 px-1.5 flex items-center justify-center transition-opacity hover:opacity-100"
          style={{
            color,
            opacity: tone === 'dark' ? 0.28 : 0.32,
            // Above the decorative dots on HeroSummary but below text content.
            zIndex: 1,
          }}
        >
          <CaretLeft size={18} weight="bold" />
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          aria-label="Next month"
          className="absolute inset-y-0 right-0 px-1.5 flex items-center justify-center transition-opacity hover:opacity-100"
          style={{
            color,
            opacity: tone === 'dark' ? 0.28 : 0.32,
            zIndex: 1,
          }}
        >
          <CaretRight size={18} weight="bold" />
        </button>
      )}
    </>
  );
}
