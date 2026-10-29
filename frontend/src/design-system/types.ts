export type ThemeName = 'light' | 'dark' | 'system';
export type ThemeResolved = 'light' | 'dark';

export interface TokenSet {
  colors: Record<string, string>; // token consumption only
  fontFamily: { sans: string; mono: string };
  spacing: Record<string, string>;
  radii: Record<string, string>;
  shadows: Record<string, string>;
  typography: {
    size: Record<string, string>;
    weight: Record<string, number>;
    lineHeight: Record<string, number>;
    letterSpacing: Record<string, string>;
  };
  motion: {
    duration: Record<string, string>;
    easing: Record<string, string>;
  };
}

export interface ThemeConfig {
  name: ThemeName;
  colors: TokenSet['colors'] & { semantic: { success: string; warning: string; error: string; info: string } };
  shadow: string;
}
