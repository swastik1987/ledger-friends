import { Plus } from '@phosphor-icons/react';

interface Props {
  onClick: () => void;
  label?: string;
}

export default function FloatingAdd({ onClick, label = 'Add' }: Props) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="fixed right-4 z-40 inline-flex items-center justify-center rounded-full text-white transition-transform active:animate-scale-tap"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
        width: 56,
        height: 56,
        background: 'hsl(var(--ember))',
        boxShadow: '0 10px 24px hsl(var(--ember) / 0.45)',
      }}
    >
      <Plus size={26} weight="bold" />
    </button>
  );
}
