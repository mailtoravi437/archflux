import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { isSignedIn } from '../state/session';
import { isServerDocId } from '../lib/honesty';
import { canEdit as roleCanEdit } from '../lib/access';
import { useDiagram } from '../state/useDiagram';
import HistoryPanel, { type CompareTarget, type LocalCheckpoint, type PairSide } from '../components/history/HistoryPanel';
import PairCompare from '../components/compare/PairCompare';
import { revertChangeAndSave } from '../components/compare/revert';
import { EmptyState } from '../components/states';
import type { DocState } from '../state/ops/types';
import type { ElementChange } from '../lib/semanticDiff';

/**
 * History screen (`#/history`, SC-27 + SC-28): the History panel on the left, and compare mode in
 * the main area once a version is picked. Everything shown comes from the revisions API, the
 * server checkpoints and the local checkpoints of the active diagram.
 */
export default function HistoryScreen() {
  const d = useDiagram();
  const { activeDocId, docTitle, nodes, edges, strokes, texts, pages, layers, checkpoints, restoreCheckpoint, reloadActiveDoc, serverVersion, theme } = d;
  const cloud = isSignedIn() && isServerDocId(activeDocId);
  const [role, setRole] = useState<'viewer' | 'commenter' | 'editor' | 'owner' | null>(null);
  // `doc: null` on the right means the live current document.
  const [sides, setSides] = useState<{ left: { label: string; doc: DocState; isCurrent: boolean }; right: { label: string; doc: DocState | null; isCurrent: boolean } } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setSides(null);
    if (!cloud) { setRole(null); return; }
    let cancelled = false;
    api.access.state(activeDocId).then(
      (r) => { if (!cancelled) setRole(r.data.role ?? null); },
      () => { if (!cancelled) setRole(null); },
    );
    return () => { cancelled = true; };
  }, [activeDocId, cloud]);

  const current = useMemo<DocState>(() => ({ nodes, edges, strokes, texts, pages, layers }), [nodes, edges, strokes, texts, pages, layers]);
  const mayEdit = cloud ? roleCanEdit(role) && role !== null : true;

  const onCompare = useCallback(async (t: CompareTarget) => {
    setLoadError(null);
    try {
      setSides({ left: { label: t.label, doc: await t.load(), isCurrent: false }, right: { label: 'Current', doc: null, isCurrent: true } });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load that version');
    }
  }, []);

  const onComparePair = useCallback(async (l: PairSide, r: PairSide) => {
    setLoadError(null);
    try {
      const [ld, rd] = await Promise.all([l.load(), r.load()]);
      // The newest revision is the current version: show the live document, which is what Revert edits.
      setSides({ left: { label: l.label, doc: ld, isCurrent: l.isCurrent }, right: { label: r.label, doc: r.isCurrent ? null : rd, isCurrent: r.isCurrent } });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load that version');
    }
  }, []);

  const onRevert = async (change: ElementChange) => {
    await revertChangeAndSave(activeDocId, change, current, serverVersion);
    await reloadActiveDoc();
  };

  const local: LocalCheckpoint[] = checkpoints;
  const isDark = theme === 'dark' || theme === 'blueprint';

  return (
    <div className="screen-view active" style={{ display: 'flex', height: 'calc(100vh - 48px)', minHeight: 0, background: '#F6F7F9' }}>
      <HistoryPanel
        diagramId={activeDocId}
        cloud={cloud}
        canEdit={mayEdit}
        localCheckpoints={local}
        onCompare={(t) => void onCompare(t)}
        onComparePair={(l, r) => void onComparePair(l, r)}
        onRestoreLocal={restoreCheckpoint}
        onRestored={reloadActiveDoc}
      />
      <div style={{ flexGrow: 1, position: 'relative', minWidth: 0 }}>
        {loadError && <div role="alert" style={{ position: 'absolute', top: 8, left: 16, zIndex: 3, color: '#B91C1C', fontSize: 12 }}>{loadError}</div>}
        {sides ? (
          <PairCompare
            key={`${sides.left.label}|${sides.right.label}|${sides.left.isCurrent}`}
            left={sides.left}
            right={{ ...sides.right, doc: sides.right.doc ?? current }}
            isDark={isDark}
            canEdit={cloud && mayEdit}
            onExit={() => setSides(null)}
            onRevert={onRevert}
          />
        ) : (
          <div style={{ padding: 24 }}>
            <EmptyState title={`History of “${docTitle}”`} body="Pick a version on the left and choose “Compare with current”, or tick two versions and choose “Compare selected”, to see what changed." />
            <p style={{ fontSize: 12 }}><Link to="/canvas">Back to the canvas</Link></p>
          </div>
        )}
      </div>
    </div>
  );
}
