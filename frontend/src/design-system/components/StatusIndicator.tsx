import { useTheme } from './ThemeProvider';
import { spacing } from '../tokens';

type Status = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusIndicatorProps { status: Status; label?: string; }

export const StatusIndicator = ({ status, label }: StatusIndicatorProps) => {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const colors = {
    success: isDark ? '#53D6B0' : '#13795B',
    warning: isDark ? '#F0B86E' : '#98600A',
    error: isDark ? '#F47788' : '#C13E55',
    info: isDark ? '#72B8FF' : '#2268B3',
    neutral: isDark ? '#A1A9B8' : '#626B7A',
  };
  const c = colors[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing['1'], fontSize: 11, fontWeight: 500, color: c }} aria-label={label ?? status}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'inline-block', flexShrink: 0 }} />
      {label || status}
    </span>
  );
};
