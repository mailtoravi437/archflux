import { useState } from 'react';
import { useDiagram } from '../useDiagram';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settings';

export default function SettingsGeneralScreen() {
  const { pushToast } = useDiagram();
  const [s, setS] = useState(loadSettings);

  const set = (patch: Partial<typeof s>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
  };

  const rebind = (tool: string, key: string) => {
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

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Canvas Defaults</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 11 }}>Rendering style
          <select className="theme-select" value={s.style} onChange={(e) => set({ style: e.target.value as 'sketchy' | 'architect' })} aria-label="Default rendering style">
            <option value="sketchy">Hand-drawn Sketchy</option>
            <option value="architect">Clean Architectural</option>
          </select>
        </label>
        <label style={{ fontSize: 11 }}>Grid style
          <select className="theme-select" value={s.gridStyle} onChange={(e) => set({ gridStyle: e.target.value as typeof s.gridStyle })} aria-label="Grid style">
            <option value="dots">Dots</option>
            <option value="lines">Lines</option>
            <option value="none">None</option>
          </select>
        </label>
        <label style={{ fontSize: 11 }}>Snap threshold
          <select className="theme-select" value={s.snapThreshold} onChange={(e) => set({ snapThreshold: e.target.value as typeof s.snapThreshold })} aria-label="Snap threshold">
            <option value="5">5px</option>
            <option value="10">10px</option>
            <option value="20">20px</option>
            <option value="off">Disabled</option>
          </select>
        </label>
        <label style={{ fontSize: 11 }}>Connector curve
          <select className="theme-select" value={s.connectorCurve} onChange={(e) => set({ connectorCurve: e.target.value as typeof s.connectorCurve })} aria-label="Default connector curve">
            <option value="orthogonal">Orthogonal</option>
            <option value="straight">Straight</option>
            <option value="bezier">Bezier Curved</option>
          </select>
        </label>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Export Preferences</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 11 }}>Image resolution
          <select className="theme-select" value={s.exportResolution} onChange={(e) => set({ exportResolution: e.target.value as typeof s.exportResolution })} aria-label="Export resolution">
            <option value="1x">1x</option>
            <option value="2x">2x Retina</option>
            <option value="4x">4x Print</option>
          </select>
        </label>
        <label style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={s.embedMetadata} onChange={(e) => set({ embedMetadata: e.target.checked })} />
          Auto-embed .arch metadata into SVG exports
        </label>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Keyboard Shortcuts (click a key to rebind)</div>
      <div role="table" aria-label="Keyboard shortcuts" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {Object.entries(s.shortcuts).map(([tool, key]) => (
          <div key={tool} role="row" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
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
      <button className="btn-xs" style={{ marginTop: 10 }} onClick={() => { const next = { ...s, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } }; setS(next); saveSettings(next); pushToast('Shortcuts reset to defaults (other settings kept)'); }} aria-label="Reset all keyboard shortcuts to defaults">
        Reset shortcuts
      </button>
    </div>
  );
}
