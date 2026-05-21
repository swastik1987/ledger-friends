import CategoryIcon from './CategoryIcon';

interface CategoryDotProps {
  icon: string;
  color: string;
  size?: number;
  soft?: boolean;
}

export default function CategoryDot({ icon, color, size = 40, soft = true }: CategoryDotProps) {
  const bg = soft ? color + '1F' : color;
  const fg = soft ? color : '#FFFFFF';
  return (
    <span
      className="inline-flex items-center justify-center shrink-0 rounded-full"
      style={{ width: size, height: size, background: bg, color: fg }}
    >
      <CategoryIcon icon={icon} color={fg} size={Math.round(size * 0.5)} />
    </span>
  );
}
