/**
 * CategoryIcon — renders a category icon as a monoline Phosphor line icon.
 * Falls back to emoji rendering for legacy data.
 */
import { CATEGORY_ICON_MAP } from '@/lib/phosphorIcons';

interface CategoryIconProps {
  icon: string;
  color?: string;
  size?: number;
}

export default function CategoryIcon({ icon, color = 'hsl(var(--ember))', size = 20 }: CategoryIconProps) {
  const PhosphorIcon = CATEGORY_ICON_MAP[icon];

  if (PhosphorIcon) {
    return <PhosphorIcon weight="regular" size={size} color={color} />;
  }

  return (
    <span style={{ fontSize: size * 0.8, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>
      {icon}
    </span>
  );
}
