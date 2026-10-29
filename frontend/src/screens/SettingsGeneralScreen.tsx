import { useState } from 'react';
import { useDiagram } from '../state/useDiagram';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../state/settings';
import type { ThemeName } from '../types';

/** Theme options (UI_REVAMP_SPEC §4): theme lives in Settings → General and the account menu. */
const THEME_OPTIONS: { id: ThemeName; label: string }[] = [
  { id: 'light', label: '☀️ Engineering Light' },
  { id: 'blueprint', label: '📐 Cyber Blueprint' },
  { id: 'dark', label: '🌙 Obsidian Dark' },
];

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** Live style preview: grid backdrop + sample route in the chosen curve. */
export function StylePreview({ gridStyle, connectorCurve }: { gridStyle: string; connectorCurve: string }) {
  const W = 220;
  const H = 96;
  const dots: { x: number; y: number }[] = [];
  for (let gy = 12; gy < H; gy += 16) {
    for (let gx = 12; gx < W; gx += 16) dots.push({ x: gx, y: gy });
  }
  const vlines = [24, 56, 88, 120, 152, 184];
  const hlines = [20, 44, 68];
  const route =
    connectorCurve === 'straight'
      ? `M 28 68 L 192 28`
      : connectorCurve === 'bezier'
        ? `M 28 68 C 90 68, 130 28, 192 28`
        : `M 28 68 L 28 28 L 192 28 L 192 28`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Style preview: ${gridStyle} grid, ${connectorCurve} connectors`}
      style={{ width: '100%', maxWidth: 260, height: 'auto', display: 'block', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 8 }}
    >
      {gridStyle === 'dots' && dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={1.3} fill="var(--canvas-grid-dot, #E5E7EB)" />
      ))}
      {gridStyle === 'lines' && (
        <g stroke="var(--canvas-grid-line, #F3F4F6)" strokeWidth={1}>
          {vlines.map((x) => <line key={`v${x}`} x1={x} y1={0} x2={x} y2={H} />)}
          {hlines.map((y) => <line key={`h${y}`} x1={0} y1={y} x2={W} y2={y} />)}
        </g>
      )}
      <rect x={14} y={52} width={56} height={30} rx={6} fill="var(--bg-panel)" stroke="var(--accent-cyan)" strokeWidth={2} />
      <rect x={150} y={12} width={56} height={30} rx={6} fill="var(--bg-panel)" stroke="var(--accent-cyan)" strokeWidth={2} />
      <path d={route} fill="none" stroke="var(--accent-cyan)" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

export default function SettingsGeneralScreen() {
  const { pushToast, theme, setTheme } = useDiagram();
  const [s, setS] = useState(loadSettings);

  const set = (patch: Partial<typeof s>) => {
    const next = deepClone(s);
    Object.assign(next, patch);
    setS(next);
    saveSettings(next);
  };

  const rebind = (tool: string, key: string) => {
    // SET-R2: reserved keys (Esc/Tab/Enter) cannot be rebound — the single-char
    // input physically cannot receive them (Esc blurs, Tab moves focus, Enter
    // submits nothing), so they are unreachable by construction. Clash detection
    // below covers everything typeable.
    const k = key.trim().toUpperCase().slice(0, 1);
    if (!k) return;
    const clash = Object.entries(s.shortcuts).find(([t, v]) => t !== tool && v === k);
    if (clash) {
      pushToast(`Key ${k} is already bound to ${clash[0]} — pick another`);
      return;
    }
    set({ shortcuts: { ...s.shortcuts, [tool]: k } });
    pushToast(`Shortcut: ${tool} → ${k}`);
  };

  return (
    <div className="content-card">
      <div className="card-head"><span className="card-title">Diagram & Editor Preferences</span></div>

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Live Preview</div>
      <div style={{ marginBottom: 12 }}>
        <StylePreview gridStyle={s.gridStyle} connectorCurve={s.connectorCurve} />
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Appearance</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 11 }} title="Colour theme for the whole app. Also available in the account menu.">
          Theme
          <select className="theme-select" value={theme} onChange={(e) => setTheme(e.target.value as ThemeName)} aria-label="Theme">
            {THEME_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Canvas Defaults</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 11 }} title="Sketchy renders hand-drawn strokes for brainstorming; Architectural renders clean lines for formal docs.">
          Rendering style
          <select className="theme-select" value={s.style} onChange={(e) => set({ style: e.target.value as 'sketchy' | 'architect' })} aria-label="Default rendering style" aria-describedby="desc-style">
            <option value="sketchy">Hand-drawn Sketchy</option>
            <option value="architect">Clean Architectural</option>
          </select>
          <span id="desc-style" className="sr-only">Sketchy renders hand-drawn strokes for brainstorming; Architectural renders clean lines for formal docs.</span>
        </label>
        <label style={{ fontSize: 11 }} title="Background grid pattern behind the canvas. Purely visual — never exported.">
          Grid style
          <select className="theme-select" value={s.gridStyle} onChange={(e) => set({ gridStyle: e.target.value as typeof s.gridStyle })} aria-label="Grid style" aria-describedby="desc-grid">
            <option value="dots">Dots</option>
            <option value="lines">Lines</option>
            <option value="none">None</option>
          </select>
          <span id="desc-grid" className="sr-only">Background grid pattern behind the canvas. Purely visual, never exported.</span>
        </label>
        <label style={{ fontSize: 11 }} title="How close (in pixels) a dragged node must get to snap to guides and grid. Off disables snapping.">
          Snap threshold
          <select className="theme-select" value={s.snapThreshold} onChange={(e) => set({ snapThreshold: e.target.value as typeof s.snapThreshold })} aria-label="Snap threshold" aria-describedby="desc-snap">
            <option value="5">5px</option>
            <option value="10">10px</option>
            <option value="20">20px</option>
            <option value="off">Disabled</option>
          </select>
          <span id="desc-snap" className="sr-only">How close, in pixels, a dragged node must get to snap to guides and grid. Off disables snapping.</span>
        </label>
        <label style={{ fontSize: 11 }} title="How connector routes bend: right-angle segments, straight lines, or smooth bezier curves.">
          Connector curve
          <select className="theme-select" value={s.connectorCurve} onChange={(e) => set({ connectorCurve: e.target.value as typeof s.connectorCurve })} aria-label="Default connector curve" aria-describedby="desc-curve">
            <option value="orthogonal">Orthogonal</option>
            <option value="straight">Straight</option>
            <option value="bezier">Bezier Curved</option>
          </select>
          <span id="desc-curve" className="sr-only">How connector routes bend: right-angle segments, straight lines, or smooth bezier curves.</span>
        </label>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Export Preferences</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 11 }} title="Pixel density of exported PNG snapshots. 2x suits retina screens, 4x suits print.">
          Image resolution
          <select className="theme-select" value={s.exportResolution} onChange={(e) => set({ exportResolution: e.target.value as typeof s.exportResolution })} aria-label="Export resolution" aria-describedby="desc-res">
            <option value="1x">1x</option>
            <option value="2x">2x Retina</option>
            <option value="4x">4x Print</option>
          </select>
          <span id="desc-res" className="sr-only">Pixel density of exported PNG snapshots. 2x suits retina screens, 4x suits print.</span>
        </label>
        <label style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }} title="Stores the diagram JSON inside exported SVGs so they can be re-imported later without a separate .arch file.">
          <input type="checkbox" checked={s.embedMetadata} onChange={(e) => set({ embedMetadata: e.target.checked })} aria-describedby="desc-embed" />
          Auto-embed .arch metadata into SVG exports
          <span id="desc-embed" className="sr-only">Stores the diagram JSON inside exported SVGs so they can be re-imported later without a separate .arch file.</span>
        </label>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Keyboard Shortcuts (click a key to rebind)</div>
      <div role="group" aria-label="Keyboard shortcuts" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {Object.entries(s.shortcuts).map(([tool, key]) => (
          <div key={tool} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <span style={{ width: 120 }}>{tool}</span>
            <input
              aria-label={`${tool} shortcut`}
              value={key}
              onChange={(e) => rebind(tool, e.target.value)}
              style={{ width: 48, textAlign: 'center', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '4px 6px', fontFamily: 'var(--mono-font)' }}
              maxLength={1}
            />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, marginTop: 12 }}>Setup Tour</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Replay the onboarding flow (persona, stacks, topology).</span>
        <button
          className="btn btn--sm btn--secondary"
          onClick={() => {
            try {
              localStorage.removeItem('archflux:onboarded');
            } catch {
              /* ignore */
            }
            pushToast('Setup tour reset — opening onboarding');
            window.location.hash = '#/onboarding';
          }}
          aria-label="Replay the setup tour"
          title="Clears the onboarded flag and opens the setup flow again."
        >
          Replay setup tour
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn btn--sm btn--secondary" onClick={() => { const next = { ...s, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } }; setS(next); saveSettings(next); pushToast('Shortcuts reset to defaults (other settings kept)'); }} aria-label="Reset all keyboard shortcuts to defaults" title="Restore default key bindings; canvas and export preferences are kept.">
          Reset shortcuts
        </button>
        <button
          className="btn btn--sm btn--secondary"
          style={{ color: 'var(--accent-rose)' }}
          onClick={() => { const next = deepClone(DEFAULT_SETTINGS); setS(next); saveSettings(next); pushToast('All settings reset to defaults'); }}
          aria-label="Reset all settings to defaults"
          title="Restore every preference on this screen (canvas, export, shortcuts) to defaults."
        >
          Reset all settings
        </button>
      </div>
    </div>
  );
}
