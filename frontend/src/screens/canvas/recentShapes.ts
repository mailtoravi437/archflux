/** Recently used library shapes (localStorage-backed, most-recent-first). */
const RECENT_SHAPES_KEY = 'archflux:recent-shapes:v1';
const MAX_RECENT_SHAPES = 8;

/** Pure recency update (most-recent-first, deduped, capped). Exported for tests. */
export function pushRecentShape(list: string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, MAX_RECENT_SHAPES);
}

export function loadRecentShapes(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SHAPES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, MAX_RECENT_SHAPES) : [];
  } catch {
    return [];
  }
}

export function recordShapeUse(id: string) {
  try {
    localStorage.setItem(RECENT_SHAPES_KEY, JSON.stringify(pushRecentShape(loadRecentShapes(), id)));
  } catch {
    /* quota ignore */
  }
}
