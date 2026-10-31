export interface EditorSettings {
  style: 'sketchy' | 'architect';
  gridStyle: 'dots' | 'lines' | 'none';
  snapThreshold: '5' | '10' | '20' | 'off';
  connectorCurve: 'orthogonal' | 'straight' | 'bezier';
  exportResolution: '1x' | '2x' | '4x';
  embedMetadata: boolean;
  shortcuts: Record<string, string>;
  pat: string;
  targetRepo: string;
  targetPath: string;
  webhookUrl: string;
  webhookSecret: string;
  polling: 'realtime' | '5m' | '1h' | 'manual';
  approvalCount: number;
  ssoProvider: string;
}

export const SETTINGS_KEY = 'archflux:settings:v1';

export const DEFAULT_SETTINGS: EditorSettings = {
  style: 'architect',
  gridStyle: 'dots',
  snapThreshold: '10',
  connectorCurve: 'orthogonal',
  exportResolution: '2x',
  embedMetadata: true,
  shortcuts: { Select: 'V', Pan: 'H', Draw: 'P', Text: 'T', Service: 'S', Gateway: 'G', Database: 'D', Queue: 'Q', Note: 'M', Connector: 'C', Library: 'L' },
  pat: '',
  targetRepo: 'acme-org/architecture',
  targetPath: 'docs/architecture.arch',
  webhookUrl: 'https://api.archflux.internal/v1/hooks/k8s',
  webhookSecret: '',
  polling: '5m',
  approvalCount: 2,
  ssoProvider: 'Okta',
};

// BUG-LIVE-025: the Git token is held in memory for the session only. It is never
// written to localStorage/sessionStorage; a reload or sign-out drops it.
let sessionGitToken = '';
export const getGitToken = () => sessionGitToken;
export const setGitToken = (t: string) => { sessionGitToken = t; };
export const clearGitToken = () => { sessionGitToken = ''; };

export function loadSettings(): EditorSettings {
  const base = { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...base, pat: sessionGitToken };
    const parsed = JSON.parse(raw);
    if (typeof parsed.pat === 'string' && parsed.pat !== '') {
      // Purge a plain-text token stored by an older build.
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...parsed, pat: '' }));
    }
    return { ...base, ...parsed, shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(parsed.shortcuts ?? {}) }, pat: sessionGitToken };
  } catch {
    return { ...base, pat: sessionGitToken };
  }
}

export function saveSettings(s: EditorSettings) {
  try {
    setGitToken(s.pat);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, pat: '' }));
  } catch {
    /* ignore */
  }
}