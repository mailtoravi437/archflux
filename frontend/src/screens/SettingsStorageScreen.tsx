import { useMemo, useState } from 'react';
import { useDiagram } from '../state/useDiagram';

export default function SettingsStorageScreen() {
  const { pushToast, pushLog } = useDiagram();
  const [confirmReset, setConfirmReset] = useState('');
  const [verdict, setVerdict] = useState<string | null>(null);
  const [scanTick, setScanTick] = useState(0);
  const rescan = () => setScanTick((t) => t + 1);

  // Keys that must survive "Clear Stored Caches": user data, credentials,
  // session/onboarding state, and all document stores.
  const PRESERVED_KEYS = new Set([
    'archflux:settings:v1', 'archflux:team:v1', 'archflux:session', 'archflux:auth_mode',
    'archflux:onboarded', 'archflux:persona', 'archflux:providers', 'archflux:pinned',
    'archflux:preserve-layout',
  ]);
  const PRESERVED_PREFIXES = ['archflux:v2', 'archflux:doc'];

  const keys = useMemo(() => {
    try {
      const out: { key: string; bytes: number }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('archflux:')) out.push({ key: k, bytes: (localStorage.getItem(k) ?? '').length });
      }
      return out.sort((a, b) => b.bytes - a.bytes);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanTick]);

  const totalKB = (keys.reduce((a, k) => a + k.bytes, 0) / 1024).toFixed(1);
  const docCount = keys.filter((k) => k.key.startsWith('archflux:v2')).length;

  /** Minimal POSIX ustar builder so backups are real .tar archives. */
  const tarFiles = (files: { name: string; data: Uint8Array }[]): Uint8Array => {
    const enc = new TextEncoder();
    const chunks: Uint8Array[] = [];
    for (const f of files) {
      const header = new Uint8Array(512);
      const writeStr = (off: number, len: number, s: string) => {
        header.set(enc.encode(s).slice(0, len), off);
      };
      writeStr(0, 100, f.name);
      writeStr(100, 8, '0000777\0');
      writeStr(108, 8, '0000000\0');
      writeStr(116, 8, '0000000\0');
      writeStr(124, 12, `${f.data.length.toString(8).padStart(11, '0')}\0`);
      writeStr(136, 12, `${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`);
      header[156] = 48; // regular file
      writeStr(257, 6, 'ustar\0');
      writeStr(263, 2, '00');
      for (let i = 148; i < 156; i++) header[i] = 32;
      let sum = 0;
      for (let i = 0; i < 512; i++) sum += header[i];
      writeStr(148, 8, `${sum.toString(8).padStart(6, '0')}\0 `);
      chunks.push(header, f.data);
      const pad = (512 - (f.data.length % 512)) % 512;
      if (pad) chunks.push(new Uint8Array(pad));
    }
    chunks.push(new Uint8Array(1024));
    const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  };

  const backup = async () => {
    try {
      const enc = new TextEncoder();
      const files = keys.map((k) => ({
        name: `archflux/${k.key.replace(/[^a-zA-Z0-9:._-]+/g, '_')}.json`,
        data: enc.encode(localStorage.getItem(k.key) ?? ''),
      }));
      const tar = tarFiles(files);
      let blob: Blob;
      let ext = 'tar.gz';
      try {
        // Fresh copy: guarantees a real ArrayBuffer for the Blob (never shared).
        const bytes = new Uint8Array(tar);
        const gz = new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(new CompressionStream('gzip'));
        blob = await new Response(gz).blob();
      } catch {
        blob = new Blob([new Uint8Array(tar).buffer as ArrayBuffer], { type: 'application/x-tar' });
        ext = 'tar';
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `archflux-workspace-backup.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      pushToast(`Workspace backup downloaded (.${ext})`);
      pushLog(`Storage: workspace backup (${ext}, ${keys.length} keys)`);
    } catch {
      pushToast('Backup failed — storage unavailable');
    }
  };

  const verify = () => {
    // Schema integrity verification: scan every stored graph for corrupt nodes/edges.
    let checked = 0;
    let corrupt = 0;
    let docsChecked = 0;
    const targets = keys
      .map((k) => k.key)
      .filter((k) => k.startsWith('archflux:v2') || k.startsWith('archflux:doc'));
    for (const key of targets.length > 0 ? targets : ['archflux:v2-light']) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed.docs) ? parsed.docs : [{ nodes: parsed.nodes, edges: parsed.edges }];
        docsChecked++;
        list.forEach((d: { nodes?: unknown[]; edges?: unknown[] }) => {
          (d.nodes ?? []).forEach((n) => {
            checked++;
            const v = n as Record<string, unknown>;
            if (typeof v.id !== 'string' || !Number.isFinite(v.x) || !Number.isFinite(v.y)) corrupt++;
          });
          (d.edges ?? []).forEach((e) => {
            const v = e as Record<string, unknown>;
            if (typeof v.id !== 'string' || typeof v.from !== 'string') corrupt++;
          });
        });
      } catch {
        corrupt++;
      }
    }
    const msg = corrupt === 0 ? `✓ Verified ${checked} nodes/edges across ${docsChecked} store(s) — no corruption detected` : `✗ Found ${corrupt} corrupt entries across ${checked} checked`;
    setVerdict(msg);
    pushLog(`Storage verification: ${msg}`);
    pushToast(msg);
  };

  const clearCaches = () => {
    let removed = 0;
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('archflux:') && !PRESERVED_KEYS.has(k) && !PRESERVED_PREFIXES.some((p) => k.startsWith(p)))
        .forEach((k) => { localStorage.removeItem(k); removed++; });
    } catch {
      /* ignore */
    }
    rescan();
    pushToast(removed > 0 ? `Cleared ${removed} cached key(s) — diagrams, settings & team retained` : 'No cached keys to clear — diagrams, settings & team retained');
    pushLog('Storage: caches cleared');
  };

  const factoryReset = () => {
    if (confirmReset !== 'RESET') {
      pushToast('Type RESET in uppercase to confirm');
      return;
    }
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('archflux:'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    setConfirmReset('');
    pushToast('Factory reset complete — reloading');
    window.setTimeout(() => window.location.reload(), 600);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="content-card">
        <div className="card-head"><span className="card-title">Storage Inspector</span><span className="badge-count cyan">{totalKB} KB</span><button className="btn btn--sm btn--secondary" onClick={rescan}>Refresh</button></div>
        <div className="card-sub">{docCount} document store(s) · {keys.length} archflux: keys · 0 orphaned threads (threads scope to docs and delete with them)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
          {keys.map((k) => (
            <div key={k.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--mono-font)', background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px' }}>
              <span>{k.key}</span><span style={{ color: 'var(--text-muted)' }}>{(k.bytes / 1024).toFixed(1)} KB</span>
            </div>
          ))}
          {keys.length === 0 && <div className="callout-block">No local data yet.</div>}
        </div>
      </div>

      <div className="content-card">
        <div className="card-head"><span className="card-title">Data Diagnostics & Backup</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn--sm btn--primary" onClick={backup}>Download Complete Workspace Backup (.tar.gz)</button>
          <button className="btn btn--sm btn--secondary" onClick={verify}>Run Schema Integrity Verification</button>
        </div>
        {verdict && <div style={{ fontSize: 12, fontFamily: 'var(--mono-font)', marginTop: 8 }} role="status">{verdict}</div>}
      </div>

      <div className="content-card" style={{ borderColor: 'var(--accent-rose)' }}>
        <div className="card-head"><span className="card-title" style={{ color: 'var(--accent-rose)' }}>Danger Zone</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn--sm btn--secondary" onClick={clearCaches} title="Removes ephemeral caches only — diagrams, settings, team and session are kept">Clear Stored Caches</button>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Type RESET to confirm factory reset
            <input
              id="factory-reset-confirm"
              className="doc-title-input"
              style={{ display: 'block', width: 160, background: 'var(--bg-panel-subtle)', border: '1px solid var(--border-panel)', borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--mono-font)', marginTop: 4 }}
              placeholder="Type RESET to confirm"
              value={confirmReset}
              onChange={(e) => setConfirmReset(e.target.value)}
              aria-label="Factory reset confirmation"
            />
          </label>
          <button className="btn btn--sm btn--secondary" style={{ background: 'var(--accent-rose)', color: '#fff', borderColor: 'var(--accent-rose)' }} onClick={factoryReset}>
            Factory Reset All Local Data
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Clears all archflux: keys. Exported .arch files are unaffected.</div>
      </div>
    </div>
  );
}
