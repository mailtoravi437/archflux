import { track } from '../../lib/analytics';
import type { SearchHit } from './searchEngine';
import { setPendingReveal } from './reveal';

export interface OpenHitDeps {
  openDoc: (id: string) => void;
  navigate: (to: string) => void;
  pushToast: (text: string) => void;
}

/** Opens a search result. Element: doc, page, selection and pan. Diagram: the canvas. Template: Blueprints. */
export function openSearchHit(hit: SearchHit, deps: OpenHitDeps): void {
  track('search_result_opened', { type: hit.kind });
  if (hit.kind === 'element') {
    setPendingReveal({ docId: hit.docId, pageId: hit.pageId, nodeId: hit.nodeId });
    deps.openDoc(hit.docId);
    deps.navigate('/canvas');
    return;
  }
  if (hit.kind === 'diagram') {
    if (!hit.loaded) {
      // Honest: a workspace diagram that this browser has not loaded cannot be opened from here yet.
      deps.pushToast(`${hit.title} is in your workspace but not loaded in this browser. Find it in the Library.`);
      deps.navigate('/dashboard');
      return;
    }
    deps.openDoc(hit.id);
    deps.navigate('/canvas');
    return;
  }
  deps.navigate('/blueprints');
}
