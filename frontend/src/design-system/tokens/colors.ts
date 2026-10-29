// ArchFlux Design System v2.0.0 — Graphite + Electric Violet
// Token consumption only; raw hex reserved for canvas/user palettes

export const brand = {
  primary: { dark: '#8B83FF', light: '#4F46E5' }, // light = --accent-cyan (UI_REVAMP_SPEC §5)
  hover: { dark: '#A49EFF', light: '#5148E5' },
  pressed: { dark: '#7169E8', light: '#4338CA' },
  subtle: { dark: '#292647', light: '#EEEDFF' },
  border: { dark: '#514A91', light: '#C9C5FF' },
  text: { dark: '#B8B2FF', light: '#5148E5' },
} as const;

export const neutral = {
  dark: {
    canvas: '#101318',
    sidebar: '#14171E',
    panel: '#191D25',
    elevated: '#202530',
    hover: '#272D39',
    active: '#303749',
    borderSubtle: '#292F3A',
    borderDefault: '#343A47',
    borderStrong: '#4B5363',
    textPrimary: '#F2F4F8',
    textSecondary: '#A1A9B8',
    textMuted: '#858E9F',
    textDisabled: '#656E7D',
  } as const,
  light: {
    canvas: '#F6F7F9', // --bg-app
    sidebar: '#FFFFFF',
    panel: '#FFFFFF',
    elevated: '#FFFFFF',
    hover: '#F0F1F7',
    active: '#E8E9F2',
    borderSubtle: '#ECEEF2',
    borderDefault: '#E3E6EB', // --border-panel
    borderStrong: '#BFC5D0',
    textPrimary: '#1B1F27', // --text-main
    textSecondary: '#5B6474', // --text-muted
    textMuted: '#5F6878', // --text-dim (>= 4.5:1 on panel)
    textDisabled: '#9299A5',
  } as const,
} as const;

export const semantic = {
  dark: {
    success: { fg: '#53D6B0', bg: '#0F3D35', border: '#1A5A4B' },
    warning: { fg: '#F0B86E', bg: '#4A2E0A', border: '#8A5E18' },
    error: { fg: '#F47788', bg: '#4A1A2A', border: '#8A2A3A' },
    info: { fg: '#72B8FF', bg: '#142A55', border: '#1A3D7A' },
    neutral: { fg: '#A1A9B8', bg: '#202530', border: '#343A47' },
  } as const,
  light: {
    success: { fg: '#13795B', bg: '#E8F5F0', border: '#C8E6D8' },
    warning: { fg: '#98600A', bg: '#FFF6E5', border: '#F5DEB3' },
    error: { fg: '#C13E55', bg: '#FCE8EB', border: '#F5C8CE' },
    info: { fg: '#2268B3', bg: '#E8F2FA', border: '#C5D7EA' },
    neutral: { fg: '#626B7A', bg: '#F0F1F7', border: '#E0E3EA' },
  } as const,
} as const;

export const canvas = {
  dark: {
    bg: '#101318',
    majorGrid: '#292F3A',
    minorGrid: '#202630',
  },
  light: {
    bg: '#FFFFFF',
    majorGrid: '#E0E3EA',
    minorGrid: '#F0F1F5',
  },
} as const;

export const node = {
  dark: { fill: '#191D25', border: '#4B5363', text: '#F2F4F8' },
  light: { fill: '#FFFFFF', border: '#C7CDD7', text: '#20242D' },
} as const;

export const edge = {
  dark: { default: '#4B5363', selected: '#8B83FF' },
  light: { default: '#C7CDD7', selected: '#4F46E5' },
} as const;

export const status = {
  success: { dark: '#53D6B0', light: '#13795B' },
  warning: { dark: '#F0B86E', light: '#98600A' },
  error: { dark: '#F47788', light: '#C13E55' },
  info: { dark: '#72B8FF', light: '#2268B3' },
  neutral: { dark: '#A1A9B8', light: '#626B7A' },
} as const;
