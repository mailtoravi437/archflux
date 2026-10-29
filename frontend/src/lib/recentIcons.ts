import type { IconRef } from '../types';

/** Recently picked icons (R1-E05-T03), kept in localStorage; every access is guarded. */
export const RECENT_ICONS_KEY = 'archflux:icons:recent:v1';
const RECENT_LIMIT = 12;

function isIconRef(v: unknown): v is IconRef {
  return typeof v === 'object' && v !== null
    && typeof (v as IconRef).id === 'string' && typeof (v as IconRef).set === 'string';
}

/** The last picks, newest first. Storage failures read as "no recents". */
export function readRecentIcons(): IconRef[] {
  try {
    const raw = window.localStorage.getItem(RECENT_ICONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isIconRef).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Records a pick at the front of the recents (deduplicated, capped at 12). */
export function recordRecentIcon(ref: IconRef): void {
  try {
    const next = [ref, ...readRecentIcons().filter((r) => !(r.id === ref.id && r.set === ref.set))].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(next.map((r) => ({ set: r.set, id: r.id }))));
  } catch {
    /* storage unavailable: recents just do not persist */
  }
}
