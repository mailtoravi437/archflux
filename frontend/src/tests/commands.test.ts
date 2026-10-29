import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerCommands,
  listCommands,
  searchCommands,
  recentCommands,
  recordCommandUse,
  suggestedForSelection,
  loadRecentCommandIds,
  type Command,
  type CommandContext,
} from '../lib/commands';
import type { DiagramActionsContextValue, DiagramUIContextValue } from '../state/store';

function cmd(id: string, title: string, extra: Partial<Command> = {}): Command {
  return { id, title, group: 'Edit', run: () => {}, ...extra };
}

const ctx: CommandContext = {
  route: '/canvas',
  selectionIds: ['a', 'b'],
  role: 'owner',
  actions: {} as unknown as DiagramActionsContextValue, // stub: commands under test do not use it
  ui: {} as unknown as DiagramUIContextValue, // stub: commands under test do not use it
  navigate: () => {},
};

let unregisterAll: Array<() => void> = [];
const reg = (cmds: Command[]) => {
  const off = registerCommands(cmds);
  unregisterAll.push(off);
  return off;
};

beforeEach(() => {
  localStorage.clear();
  unregisterAll.forEach((off) => off());
  unregisterAll = [];
});
afterEach(() => {
  unregisterAll.forEach((off) => off());
  unregisterAll = [];
});

describe('command registry (R1-E10-T03, FL-19)', () => {
  it('search ranks prefix match first', () => {
    reg([
      cmd('a.close', 'Close editor'),   // substring only → tier 2
      cmd('a.save', 'Save diagram'),    // prefix → tier 4
      cmd('a.filter', 'Filter graph'),  // no match at any tier
    ]);
    const ranked = searchCommands(ctx, 's');
    // Prefix beats substring; non-matches are dropped entirely.
    expect(ranked.map((c) => c.id)).toEqual(['a.save', 'a.close']);
  });

  it('when() hides unavailable commands', () => {
    reg([
      cmd('sel.align', 'Align left', { when: (c) => c.selectionIds.length >= 2 }),
      cmd('sel.pick', 'Pick a node', { when: (c) => c.selectionIds.length >= 1 }),
      cmd('sel.any', 'Always there', { when: (c) => c.selectionIds.length >= 99 }),
    ]);
    const visible = listCommands(ctx).map((c) => c.id);
    expect(visible).toEqual(['sel.align', 'sel.pick']);
    // Suggested: selection-dependent commands whose `when` passes now but
    // fails with an empty selection — both align (≥2) and pick (≥1).
    const empty = { ...ctx, selectionIds: [] };
    expect(suggestedForSelection({ ...ctx, selectionIds: ['a', 'b'] }).map((c) => c.id)).toEqual(['sel.align', 'sel.pick']);
    expect(suggestedForSelection(empty)).toEqual([]);
  });

  it('recent commands appear first in search results', () => {
    reg([
      cmd('a.save', 'Save diagram'),
      cmd('a.layout', 'Auto-layout (DAG)'),
      cmd('a.theme', 'Theme: Obsidian Dark'),
    ]);
    // Ranked purely: substring matches are behind the title-length tie-break.
    expect(searchCommands(ctx, 'a')[0].id).not.toBe('a.theme');
    recordCommandUse('a.theme');
    recordCommandUse('a.save');
    expect(loadRecentCommandIds()).toEqual(['a.save', 'a.theme']);
    // Recents first when nothing is typed (palette's Recent section).
    // `a.layout` was never used, so it is not in the recents list.
    expect(recentCommands(ctx).map((c) => c.id)).toEqual(['a.save', 'a.theme']);
  });

  it('a command runs once and stays registered until unregistered', () => {
    let runs = 0;
    const c = cmd('a.run', 'Run the thing');
    c.run = () => {
      runs += 1;
    };
    const off = reg([c]);
    expect(listCommands(ctx).length).toBe(1);
    searchCommands(ctx, 'run')[0].run(ctx);
    expect(runs).toBe(1);
    off();
    expect(listCommands(ctx).length).toBe(0);
  });

  it('re-registering an id replaces the earlier command', () => {
    reg([cmd('a.save', 'Save diagram')]);
    reg([cmd('a.save', 'Save diagram to server')]);
    expect(listCommands(ctx).length).toBe(1);
    expect(listCommands(ctx)[0].title).toBe('Save diagram to server');
  });
});
