import { useTheme } from './ThemeProvider';
import { spacing, radii } from '../tokens';

export const BackendShapeCard = ({ type }: { type: string }) => {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: spacing[3], padding: spacing[3],
      borderRadius: radii.md, border: `1px solid ${isDark ? '#343A47' : '#E0E3EA'}`, background: isDark ? '#191D25' : '#FFFFFF',
      color: isDark ? '#F2F4F8' : '#20242D', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
    }} aria-label={type}>
      <img src="/assets/icons/archflux-system-design-200/database.svg" alt="" style={{ width: 24, height: 24, flexShrink: 0 }} />
      <span style={{ fontWeight: 500, fontSize: 14 }}>{type}</span>
    </div>
  );
};
