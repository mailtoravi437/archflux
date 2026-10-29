import type { ArchEdge, ArchNode } from '../../types';
import { useDiagram } from '../../state/useDiagram';

export interface LintCardsProps {
  orphans: ArchNode[];
  danglings: ArchEdge[];
  ambiguous: ArchEdge[];
  /** Selects the isolated node and auto-binds it. */
  onAutoBind: (nodeId: string) => void;
  onTagProtocol: (edgeId: string, protocol: string) => void;
  /** Called after a card or an Inspect button pans to its target (the dialog closes so the canvas is visible). */
  onInspect?: () => void;
}

/** The lint cards (body of the Architecture linter dialog, opened from the status menu). */
export function LintCards({ orphans, danglings, ambiguous, onAutoBind, onTagProtocol, onInspect }: LintCardsProps) {
  const { panToNode, pruneWire } = useDiagram();
  const inspect = (id: string) => { panToNode(id); onInspect?.(); };
  const remaining = orphans.length + danglings.length + ambiguous.length;
  return (
      <div className="linter-body" id="linterCardsContainer">
        {remaining === 0 ? (
          <div className="lint-card" style={{ borderLeft: '3px solid var(--accent-emerald)' }}>
            <div className="lint-head" style={{ color: 'var(--accent-emerald)' }}>
              ✓ Zero lint errors
            </div>
            <p className="lint-desc">All microservices have valid bus connectors and strict port bindings.</p>
          </div>
        ) : (
          <>
            {orphans.map((n) => (
              <div key={n.id} className="lint-card warn" onClick={() => inspect(n.id)} role="button" tabIndex={0} aria-label={`Isolated node ${n.label} — activate to inspect`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(n.id); } }}>
                <div className="lint-head">
                  <span style={{ color: 'var(--accent-amber)' }}>⚠️ Isolated: {n.label}</span>
                  <span>Topology</span>
                </div>
                <p className="lint-desc"><strong>{n.label}</strong> isn&apos;t connected to anything yet. Bind it or delete it.</p>
                <div className="lint-btn-row">
                  <button className="btn btn--sm btn--secondary" onClick={(e) => { e.stopPropagation(); inspect(n.id); }}>Inspect</button>
                  <button className="btn btn--sm btn--primary" onClick={(e) => { e.stopPropagation(); onAutoBind(n.id); }}>Auto-bind</button>
                </div>
              </div>
            ))}
            {danglings.map((e) => (
              <div key={e.id} className="lint-card danger" onClick={() => inspect(e.from)} role="button" tabIndex={0} aria-label={`Dangling wire from ${e.from} — activate to inspect`} onKeyDown={(e2) => { if (e2.key === 'Enter' || e2.key === ' ') { e2.preventDefault(); inspect(e.from); } }}>
                <div className="lint-head">
                  <span style={{ color: 'var(--accent-rose)' }}>🚫 Dangling: {e.from} → ∅</span>
                  <span>Routing</span>
                </div>
                <p className="lint-desc">Wire <strong>{e.id}</strong> terminates in empty space. Prune or reconnect.</p>
                <div className="lint-btn-row">
                  <button className="btn btn--sm btn--secondary" onClick={(ev) => { ev.stopPropagation(); inspect(e.from); }}>Inspect</button>
                  <button className="btn btn--sm btn--primary" onClick={(ev) => { ev.stopPropagation(); pruneWire(e.id); }}>Prune Wire</button>
                </div>
              </div>
            ))}
            {ambiguous.map((e) => (
              <div key={e.id} className="lint-card warn" onClick={() => inspect(e.from)} role="button" tabIndex={0} aria-label={`Protocol ambiguity on route ${e.label || e.id} — activate to inspect`} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); inspect(e.from); } }}>
                <div className="lint-head">
                  <span style={{ color: 'var(--accent-amber)' }}>❓ Protocol Ambiguity: {e.label || e.id}</span>
                  <span>Contract</span>
                </div>
                <p className="lint-desc">Inter-service route <strong>{e.from} → {e.to}</strong> has no protocol tag. Highlight the node or tag it.</p>
                <div className="lint-btn-row">
                  <button className="btn btn--sm btn--secondary" onClick={(ev) => { ev.stopPropagation(); inspect(e.from); }}>Inspect</button>
                  <button className="btn btn--sm btn--primary" onClick={(ev) => { ev.stopPropagation(); onTagProtocol(e.id, 'REST'); }}>Tag REST</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
  );
}
