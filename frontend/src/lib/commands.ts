/**
 * Command registry (R1-E10-T03, FL-19). Features register commands here and
 * the command palette lists and searches them. Pure module: no React.
 */
import type { DiagramActionsContextValue, DiagramUIContextValue } from '../state/store';

export type CommandGroup = 'Edit' | 'Arrange' | 'Display' | 'View' | 'Navigate' | 'File' | 'Review' | 'Advanced';

export interface Command {
  id: string;                 // 'arrange.alignLeft'
  title: string;              // 'Align left'
  group: CommandGroup;
  shortcut?: string;          // display form: '⌥⇧L' (mac) / 'Alt+Shift+L'
  keywords?: string[];
  when?: (ctx: CommandContext) => boolean;     // availability (selection count, role, route)
  run: (ctx: CommandContext) => void;
}

export interface CommandContext {
  route: string;
  selectionIds: string[];
  role: 'owner' | 'editor' | 'commenter' | 'viewer';
  actions: DiagramActionsContextValue;
  ui: DiagramUIContextValue;
  navigate: (to: string) => void;
}

/** Display order of groups in the palette. */
export const COMMAND_GROUPS: CommandGroup[] = ['File', 'Edit', 'Arrange', 'Display', 'View', 'Navigate', 'Review', 'Advanced'];

export const RECENT_COMMANDS_KEY = 'archflux:commands:recent:v1';
export const RECENT_COMMANDS_MAX = 5;

const registry = new Map<string, Command>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

/** Register commands. A later registration with the same id replaces the earlier one. */
export function registerCommands(cmds: Command[]): () => void {
  for (const c of cmds) registry.set(c.id, c);
  notify();
  return () => {
    let changed = false;
    for (const c of cmds) {
      if (registry.get(c.id) === c) {
        registry.delete(c.id);
        changed = true;
      }
    }
    if (changed) notify();
  };
}

/** Subscribe to registry changes (the palette re-renders when features register). */
export function subscribeCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isAvailable(cmd: Command, ctx: CommandContext): boolean {
  if (!cmd.when) return true;
  try {
    return cmd.when(ctx);
  } catch {
    return false;
  }
}

function groupRank(g: CommandGroup): number {
  const i = COMMAND_GROUPS.indexOf(g);
  return i < 0 ? COMMAND_GROUPS.length : i;
}

/** Available commands, ordered by group then title. */
export function listCommands(ctx: CommandContext): Command[] {
  return Array.from(registry.values())
    .filter((c) => isAvailable(c, ctx))
    .sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.title.localeCompare(b.title));
}

/**
 * Commands whose availability depends on the current selection: their `when`
 * passes now but fails with an empty selection.
 */
export function suggestedForSelection(ctx: CommandContext): Command[] {
  if (ctx.selectionIds.length === 0) return [];
  const empty: CommandContext = { ...ctx, selectionIds: [] };
  return listCommands(ctx).filter((c) => c.when && !isAvailable(c, empty));
}

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9.]+/i).filter(Boolean);
}

function isSubsequence(hay: string, needle: string): boolean {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
}

/** 4 prefix, 3 word-start, 2 substring, 1 subsequence, 0 no match. */
function matchScore(cmd: Command, q: string): number {
  const title = cmd.title.toLowerCase();
  const kws = (cmd.keywords ?? []).map((k) => k.toLowerCase());
  if (title.startsWith(q)) return 4;
  const qWords = words(q);
  const titleWords = words(title);
  const allWords = [...titleWords, ...kws.flatMap(words)];
  if (qWords.length > 0 && qWords.every((qw) => allWords.some((w) => w.startsWith(qw)))) return 3;
  if (title.includes(q) || kws.some((k) => k.includes(q))) return 2;
  if (isSubsequence(title, q.replace(/\s+/g, ''))) return 1;
  return 0;
}

/** Fuzzy search: prefix > word-start > substring; recents boosted within a tier. */
export function searchCommands(ctx: CommandContext, q: string): Command[] {
  const query = q.trim().toLowerCase();
  const available = listCommands(ctx);
  if (!query) return available;
  const recent = loadRecentCommandIds();
  return available
    .map((c) => {
      const base = matchScore(c, query);
      const r = recent.indexOf(c.id);
      const boost = base > 0 && r >= 0 ? 0.5 - r * 0.05 : 0;
      return { c, score: base + boost };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.title.length - b.c.title.length || a.c.title.localeCompare(b.c.title))
    .map((x) => x.c);
}

/** Most recent first, at most RECENT_COMMANDS_MAX ids. */
export function loadRecentCommandIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_COMMANDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_COMMANDS_MAX);
  } catch {
    return [];
  }
}

export function recordCommandUse(id: string): void {
  try {
    const next = [id, ...loadRecentCommandIds().filter((x) => x !== id)].slice(0, RECENT_COMMANDS_MAX);
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: recents are a convenience */
  }
}

/** Recently used commands that are still available, most recent first. */
export function recentCommands(ctx: CommandContext): Command[] {
  const available = new Map(listCommands(ctx).map((c) => [c.id, c]));
  return loadRecentCommandIds()
    .map((id) => available.get(id))
    .filter((c): c is Command => !!c);
}

/** True on Apple platforms, where shortcuts display as ⌘/⌥/⇧. */
export function isMacPlatform(): boolean {
  try {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  } catch {
    return false;
  }
}

/** Pick the platform display form of a shortcut. */
export function shortcutLabel(mac: string, other: string): string {
  return isMacPlatform() ? mac : other;
}
