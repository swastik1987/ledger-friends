/**
 * CategoryIcon — renders a category icon.
 * - If the stored icon name is in CATEGORY_ICON_MAP → renders Phosphor Duotone SVG icon
 * - Otherwise → renders as emoji/text (backward compatibility with old data)
 */
import { CATEGORY_ICON_MAP } from '@/lib/phosphorIcons';

interface CategoryIconProps {
  icon: string;
  color?: string;
  size?: number;
}

export default function CategoryIcon({ icon, color = '#6366f1', size = 20 }: CategoryIconProps) {
  const PhosphorIcon = CATEGORY_ICON_MAP[icon];

  if (PhosphorIcon) {
    return <PhosphorIcon weight="duotone" size={size} color={color} />;
  }

  // Fallback: emoji or legacy text
  return (
    <span style={{ fontSize: size * 0.8, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>
      {icon}
    </span>
  );
}
