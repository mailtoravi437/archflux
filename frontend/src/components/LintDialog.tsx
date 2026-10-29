import { useEffect, useMemo } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useDiagram } from '../state/useDiagram';
import { LintCards } from '../screens/canvas/LintCards';

/**
 * Architecture linter dialog, opened from the app-bar status menu
 * ("Linter (N issues)"). It replaced the dock Linter tab (R1-E14-T10).
 * Same derivation as `lintCount`, so the number matches the status label.
 */
export default function LintDialog({ onClose }: { onClose: () => void }) {
  const { nodes, edges, healAll, healOrphan, setSelectedId, setSelectedEdgeId, updateEdge, checkpoint, pushToast } = useDiagram();
  const trap = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { orphans, danglings, ambiguous } = useMemo(() => {
    const deg = new Map<string, number>();
    nodes.forEach((n) => deg.set(n.id, 0));
    edges.forEach((e) => {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      if (e.to) deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    });
    return {
      orphans: nodes.filter((n) => (deg.get(n.id) ?? 0) === 0 || n.isOrphan),
      danglings: edges.filter((e) => e.isDangling || !e.to),
      ambiguous: edges.filter((e) => e.to && !e.isDangling && !e.protocol),
    };
  }, [nodes, edges]);
  const remaining = orphans.length + danglings.length + ambiguous.length;

  return (
    <div className="lint-dialog-scrim" onClick={onClose}>
      <div ref={trap} role="dialog" aria-modal="true" aria-label="Architecture linter" className="lint-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="lint-dialog__head">
          <h2 className="lint-dialog__title">Architecture linter</h2>
          <span className="lint-dialog__count" aria-label={`${remaining} issues`}>{remaining}</span>
          <span className="lint-dialog__spacer" />
          <button type="button" className="lint-dialog__heal" onClick={healAll}>Auto-Heal All</button>
          <button type="button" className="lint-dialog__close" aria-label="Close linter" title="Close" onClick={onClose}>×</button>
        </div>
        <div className="lint-dialog__body">
          <LintCards
            orphans={orphans}
            danglings={danglings}
            ambiguous={ambiguous}
            onInspect={onClose}
            onAutoBind={(id) => { setSelectedId(id); setSelectedEdgeId(null); healOrphan(id); }}
            onTagProtocol={(edgeId, protocol) => { checkpoint(false); updateEdge(edgeId, { protocol }); pushToast(`Tagged ${protocol} on route`); }}
          />
        </div>
      </div>
    </div>
  );
}
