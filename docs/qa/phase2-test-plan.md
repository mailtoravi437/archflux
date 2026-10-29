# Phase 2 Test Plan — Canvas / Theme / Token Updates

Status: Draft — prepared for Phase 1-2 visual regression and accessibility changes. No `npm test` breakage introduced.

## 1. Review of existing canvas/geometry/accessibility tests

- `src/tests/canvas-geometry.test.ts` — resizeHandles, clampNodeSize, snapNode, minimapTransform. Stable; no snapshot dependencies.
- `src/tests/canvas.accessibility.test.tsx` — aria-label, tool-rail buttons, library drawer, keyboard navigation, touch, drag logic, auto-layout. Multiple `.skip` tests (command palette, focus trap, screen-reader navigation, touch pinch). Do not unskip without design-system ARIA spec sign-off.
- `src/tests/canvas.test.tsx` — store interactions, paint calls, selections, edges. No snapshot assertions; safe for Phase 2.

## 2. Snapshot change flags (visual regression) — Phase 2 token freeze

File: `e2e/visual-regression.spec.ts`
- `canvas-dark-theme.png` — must reflect dark theme tokens (selection outline, node fill, grid colors per spec #8B83FF / #635BFF brand; NOT cyan/blue legacy).
- `canvas-light-theme.png` — new explicit light pair added; must match brand palette, not cyan/blue.
- `canvas-blueprint-theme.png` — same; blueprint palette changes affect pixel values.
- `canvas-initial.png`, `canvas-with-nodes-and-edge.png` — regenerated after Phase 2 restyles (selection ring, node borders, grid). Lock refs so token changes trigger clear diffs.
- `command-palette.png`, `library-drawer.png` — surface backgrounds / text colors tied to theme tokens.
- Snapshot folder: `e2e/visual-regression.spec.ts-snapshots/` (per-browser/per-OS files: `-chromium-darwin.png`, `-firefox-darwin.png`, `-webkit-darwin.png`).

### Phase 2 token / color lock note
Phase 2 changed selection outline, node fill, and grid colors. All baselines must reflect the new spec: brand purple `#8B83FF` / `#635BFF`, not legacy cyan/blue. If regenerated baselines show cyan/blue pixels, the theme token file (e.g. `src/theme/tokens.css` or token source) has not been fully applied — do not merge until brand colors are confirmed.

### Baseline regeneration procedure
Only regenerate after design-system token freeze and manual visual approval.
```bash
# Update all existing snapshots (chromium / webkit / firefox)
npx playwright test --update-snapshots

# Target specific theme pair (e.g., new light-theme pair)
npx playwright test e2e/visual-regression.spec.ts --update-snapshots -g "light theme matches snapshot"

# Browsers under test (projects in playwright.config.cjs):
# - chromium (Desktop Chrome)
# - firefox (Desktop Firefox)
# - webkit (Desktop Safari)
# Mobile Chrome / Mobile Safari are secondary; do not rely on them for canvas baseline lock.

# Threshold settings (see playwright.config.cjs expect.toHaveScreenshot):
# - maxDiffPixels: 12000 (~1.6% of 1280x672 canvas; absorbs icon/text AA noise)
# - threshold: 0.2 (per-pixel comparison; catches layout/theme breakage >10% of pixels)
```

Recommendation: Do not commit updated baselines until `canvas-dark-theme.png`, `canvas-light-theme.png`, `canvas-with-nodes-and-edge.png` have been inspected for brand purple (`#8B83FF` / `#635BFF`) and absence of cyan/blue legacy pixels.

## 3. New tests added (no `npm test` break)

- `src/tests/theme-provider-persist.test.tsx` — ThemeProvider persistence (localStorage read/write, document `data-theme`/class updates, `matchMedia` mock included). Passes with vitest.
- `src/tests/validateTokens.test.ts` — `validateTokens` rules (clean source, 4px spacing flag, raw hex context, `tokenValidation.checkFile`). Passes with vitest.

Both use only vitest + testing-library; no Playwright or snapshot dependencies.

## 4. Proposed e2e light/dark canvas coverage — IMPLEMENTED

File: `e2e/visual-regression.spec.ts` — explicit light/dark pairs confirmed.
- `canvas light theme matches snapshot` (explicit `selectOption('light')` + assert `data-theme='light'` + `canvas-light-theme.png`) — ADDED.
- `canvas dark theme matches snapshot` (exists; kept; `canvas-dark-theme.png`).
- Cross-theme node rendering: same nodes in light/dark, assert `data-theme` flips and canvas is stable.

Implemented test snippet (committed):
```ts
test('light theme matches snapshot', async ({ page }) => {
  await page.selectOption('select[aria-label="Theme"]', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#architectureCanvas')).toHaveScreenshot('canvas-light-theme.png', shot);
});
```

## 5. Validation steps before Phase 3

- [x] `npm test -- --run src/tests/theme-provider-persist.test.tsx src/tests/validateTokens.test.ts` passes.
- [ ] Regenerate `canvas-dark-theme.png` and `canvas-light-theme.png` baselines after token freeze; verify brand purple `#8B83FF` / `#635BFF`, no cyan/blue.
- [x] Added explicit `canvas-light-theme.png` pair (`chromium-darwin`, `firefox-darwin`, `webkit-darwin`).
- [ ] Regenerate `canvas-with-nodes-and-edge.png` after selection-outline / node-fill changes.
- [ ] Unskip accessibility tests only after ARIA spec update (not in this plan).
- [ ] Run full `npm test` after any canvas geometry change (snapshots not part of vitest; only Playwright affected).

---
Prepared by subagent session. No source changes outside tests/docs; no package.json modifications.
