/**
 * "Open element" from search (R1-E10-T04): open the doc, switch page, select the element and
 * pan to it. The doc switch is asynchronous, so the target waits in a tiny module store and
 * {@link SearchReveal} (mounted once in AppShell) completes it as soon as the doc is active and
 * the element is loaded. A target that never resolves is dropped after 3 s, never retried silently.
 */
export interface RevealTarget {
  docId: string;
  pageId: string;
  nodeId: string;
}

let pending: RevealTarget | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setPendingReveal(t: RevealTarget | null): void {
  pending = t;
  if (expiry) clearTimeout(expiry);
  expiry = t ? setTimeout(() => setPendingReveal(null), 3000) : null;
  emit();
}

export function getPendingReveal(): RevealTarget | null {
  return pending;
}

export const subscribePendingReveal = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
