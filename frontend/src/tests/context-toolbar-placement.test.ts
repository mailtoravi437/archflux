import { describe, it, expect } from 'vitest';
import { placeContextToolbar, TOOLBAR_GAP, TOOLBAR_HEIGHT } from '../screens/canvas/contextToolbarPlacement';

// Main.dc.html "Selection toolbar placement rule" (2026-10-26).
describe('context toolbar placement', () => {
  const bar = TOOLBAR_HEIGHT;

  it('anchors above the selection with the fixed 12 px gap', () => {
    const r = placeContextToolbar({ selTop: 300, selBottom: 372, barHeight: bar });
    expect(TOOLBAR_GAP).toBe(12);
    expect(r.placement).toBe('above');
    expect(r.top + bar).toBe(300 - TOOLBAR_GAP);
    expect(r.top + bar).toBeLessThan(300);
  });

  it('flips below the selection when there is no room above', () => {
    const r = placeContextToolbar({ selTop: 40, selBottom: 112, barHeight: bar });
    expect(r.placement).toBe('below');
    expect(r.top).toBe(112 + TOOLBAR_GAP);
    expect(r.top).toBeGreaterThan(112);
  });

  it('stays above when it exactly fits (8 px from the top edge)', () => {
    const selTop = 8 + bar + TOOLBAR_GAP;
    const r = placeContextToolbar({ selTop, selBottom: selTop + 72, barHeight: bar });
    expect(r.placement).toBe('above');
    expect(r.top).toBe(8);
  });

  it('never intersects the selection rectangle for any selection position or bar height', () => {
    for (const barHeight of [bar, 60, 96]) {
      for (let selTop = -200; selTop <= 800; selTop += 7) {
        for (const h of [20, 72, 400]) {
          const selBottom = selTop + h;
          const r = placeContextToolbar({ selTop, selBottom, barHeight });
          const barBottom = r.top + barHeight;
          const overlaps = r.top < selBottom && barBottom > selTop;
          expect(overlaps, `selTop=${selTop} h=${h} bar=${barHeight}`).toBe(false);
        }
      }
    }
  });
});
