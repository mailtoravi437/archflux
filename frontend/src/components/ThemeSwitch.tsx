import type { ThemeName } from '../types';

interface Props {
  theme: ThemeName;
  onChange: (t: ThemeName) => void;
}

export default function ThemeSwitch({ theme, onChange }: Props) {
  const options: { value: ThemeName; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: '☀' },
    { value: 'blueprint', label: 'Blueprint', icon: '📐' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
  ];
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`theme-btn${theme === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
          aria-pressed={theme === o.value}
          title={o.label}
        >
          <span aria-hidden="true">{o.icon}</span>
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
