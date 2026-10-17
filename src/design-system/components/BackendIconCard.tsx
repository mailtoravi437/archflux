import { useTheme } from './ThemeProvider';
import { spacing, radii } from '../tokens';
import { ShapeIcon } from './ShapeIcon';
import { iconLibrary, type ShapeIconKey } from './iconLibrary';

export const BackendIconCard = ({ type }: { type: ShapeIconKey }) => {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const entry = iconLibrary[type];
  const label = entry?.label ?? type.charAt(0).toUpperCase() + type.slice(1).replace(/([A-Z])/g, ' $1').trim();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: spacing[3], padding: spacing[3],
      borderRadius: radii.md,
      border: `1px solid ${isDark ? '#343A47' : '#E0E3EA'}`,
      background: isDark ? '#191D25' : '#FFFFFF',
      color: isDark ? '#F2F4F8' : '#20242D',
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
    }} aria-label={label}>
      <ShapeIcon name={type} size={22} />
      <span style={{ fontWeight: 500, fontSize: 14 }}>{label}</span>
    </div>
  );
};
