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

export function loadSettings(): EditorSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw), shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(JSON.parse(raw).shortcuts ?? {}) } };
  } catch {
    return { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } };
  }
}

export function saveSettings(s: EditorSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}