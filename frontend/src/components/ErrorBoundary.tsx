import { Component } from 'react';
import type { ReactNode } from 'react';
import { copyText } from '../lib/clipboard';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  copied: boolean;
}

/** Last-resort crash UI: never white-screens the product. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, copied: false };
  }

  private reloadCanvas = () => {
    window.location.assign('/canvas');
  };

  private loadSafeDefault = () => {
    // Stash the corrupted graph; with storage cleared the app starts on an empty canvas.
    try {
      const raw = localStorage.getItem('archflux:v2-light');
      if (raw) localStorage.setItem('archflux:corrupt-backup', raw);
      localStorage.removeItem('archflux:v2-light');
    } catch {
      /* storage unavailable */
    }
    window.location.assign('/canvas');
  };

  render(): ReactNode {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    const details = `${error.name}: ${error.message}\n${error.stack ?? ''}`.slice(0, 2000);
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F7F5', padding: 24 }}>
        <div style={{ maxWidth: 520, background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: 28 }}>
          <h1 data-testid="error-boundary-title" style={{ fontSize: 20, color: '#1F2937', margin: '0 0 8px' }}>Something broke on the canvas</h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 12px' }}>
            ArchFlux hit an unexpected error. Your diagrams are stored locally — try reloading first. If it persists,
            reset local data (exports you downloaded are unaffected).
          </p>
          <pre style={{ fontSize: 11, background: '#F7F7F5', border: '1px solid #E5E7EB', borderRadius: 6, padding: 10, overflow: 'auto', maxHeight: 140, whiteSpace: 'pre-wrap' }}>
            {details}
          </pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" data-testid="error-boundary-reload" className="btn btn-primary" onClick={this.reloadCanvas}>
              Reload Canvas
            </button>
            <button type="button" className="btn" onClick={this.loadSafeDefault} title="Stashes the broken graph to archflux:corrupt-backup and starts an empty canvas">
              Start Empty Canvas
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void copyText(details).then((ok) => this.setState({ copied: ok }));
              }}
            >
              {copied ? 'Copied ✓' : 'Copy Debug Trace'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
