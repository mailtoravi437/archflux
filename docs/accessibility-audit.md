# Accessibility Audit — ArchFlux Design System v2.0.0 §13
**Audit date:** 2026-10-16  
**Auditor:** Subagent (accessibility / a11y)  
**Scope:** `src/` only (exclude `node_modules/`, `dist/`)  
**Ref design-system:** `src/design-system/tokens/colors.ts` (v2.0.0 — Graphite + Electric Violet)  
**Status:** Documentation-first (no source edits made); issues flagged for Phase 4.

---

## 1. Method
- Searched `.tsx` / `.ts` / `.css` for hardcoded hex / `rgb()` / `rgba()`.
- Verified `focus-visible`, `disabled`, contrast tokens, keyboard, `prefers-reduced-motion`, screen-reader rules (`aria-label`, `sr-only`, error association, icon labels, color-only).
- Cross-checked against `src/design-system/tokens/colors.ts`, `src/styles.css`, canvas restyle proposal (`docs/canvas-restyle-proposal.md`).

---

## 2. Hardcoded Colors — Findings

### 2.1 High-volume hardcoding (canvas / mock data / inline styles)
| Pattern | Risk | File refs |
|---|---|---|
| Canvas stroke / fill / edge colors hard-coded (`#2563EB`, `#7C3AED`, `#16A34A`, `#D97706`, `#DC2626`, `#1F2937`, `#FFFFFF`, `#9CA3AF`, `#F9FAFB`, `#F8F9FA`, `#E5E7EB`) | **Medium–High** — bypasses design system tokens; breaks dark-mode consistency | `src/screens/CanvasScreen.tsx` (lines 86–107 swatches; draw loop ~830–1118); `src/mocks.ts` (stroke/color fields) |
| Mock diagram node/edge colors (`#2563EB`, `#D97706`, `#7C3AED`, `#DC2626`, `#FF9900`, `#4285F4`, `#0078D4`, `#336791`, `#47A248`) | **Low** (mock data only) | `src/mocks.ts` lines 14–56, 261–353 |
| Badge / status inline colors (`#DCFCE7`, `#FEF3C7`, `#FEE2E2` with text `#16A34A` / `#D97706` / `#DC2626`) | **Low** (color paired with text/icon) | `src/screens/ReviewsScreen.tsx`, `LiveScreen.tsx`, `DashboardScreen.tsx`, `GitScreen.tsx` |
| Inline `style={{ color: '#6B7280' }}` / `#FFFFFF` / `#F7F7F5` / `#E5E7EB` / `#DC2626` / `#D97706` / `#16A34A` | **Medium** — scattered, should migrate to tokens | `AppShell.tsx`, `CollaborationPanel.tsx`, `RevisionsSection.tsx`, `ErrorBoundary.tsx`, `OnboardingScreen.tsx`, `SettingsGeneralScreen.tsx`, `AuthCallbackScreen.tsx` |

### 2.2 Design-system token coverage gap
- `src/design-system/components/` and `src/design-system/themes/` are **empty** (confirmed by `docs/canvas-restyle-proposal.md` lines 16–17).
- Token file `colors.ts` defines `brand.graphite` / `brand.violet` / `neutral` / `semantic` but canvas/render components do not import them; they use CSS variables (`--accent-cyan`, `--bg-canvas`) or hardcoded hex.
- **Proposal:** consolidate canvas/node colors behind `brand.violet.600` (`#7C3AED`) for selection / brand outline and `semantic.*` for errors/warnings per §10 restyle proposal.

---

## 3. Focus-Visible (§13 / §10 — Brand Outline)

| Check | Finding | Risk | File ref |
|---|---|---|---|
| Focus outline uses brand color? | **No.** `input:focus-visible, button:focus-visible, select:focus-visible` uses `var(--accent-cyan)` (`#2563EB`). Design-system brand outline should be violet (`#7C3AED`) or graphite to distinguish from error/semantic blue. | **Medium** | `src/styles.css:1667` |
| Outline offset / thickness | `outline: 2px solid ...; outline-offset: 1px;` — acceptable. | — | `src/styles.css:1667` |
| Focus visible on interactive divs (`role="button"`) | Most have `tabIndex={0}` + `onKeyDown` for Enter/Space; some missing Space (e.g., `DashboardScreen` uses only Enter). | **Medium** | `DashboardScreen.tsx:444`, `BlueprintsScreen.tsx:293` |
| Focus trap / modal focus | `useFocusTrap.ts` exists; `ConflictDialog`, `CanvasScreen` connector modal use focus trapping. | Good | `src/useFocusTrap.ts` |
| No skip-link / skip-to-content | **Not found.** No `.skip-link` or `sr-only` skip anchor at top of DOM. Keyboard users must tab through nav/rail on every load. | **Medium** | — (missing) |

**Phase 4 action:** Update `styles.css:1667` to `var(--accent-violet, #7C3AED)` (or token `brand.violet.600`); add `Space` to all `onKeyDown` handlers for `role="button"`; add skip-link component.

---

## 4. Disabled Understandable (§13)

| Check | Finding | Risk | File ref |
|---|---|---|---|
| Visual cue beyond opacity? | `button:disabled { opacity: 0.5; cursor: not-allowed; }` — only opacity. No text change, no `aria-disabled` paired with visual description, no reduced-color cue. | **Medium** | `src/styles.css:1632` |
| `aria-disabled` used? | Yes on palette commands (`AppShell.tsx:709`) and some buttons; but `disabled` prop also present. Good for screen readers. | Good | `AppShell.tsx` |
| Disabled buttons with title/label? | Undo/Redo, Reply, Save Connector, Send Request, Continue, etc. use `title` or `aria-label`: good. | Good | Multiple |
| Disabled + `cursor: not-allowed` on links / div buttons? | Not applied to `div role="button"` with `tabIndex={0}`; only native buttons. | Low | — |

**Phase 4 action:** Enhance disabled style with `border-color`/`color` change (e.g., `var(--text-dim)`) and add `aria-describedby` pointing to a helper text when disabled for reason (e.g., “Name required”).

---

## 5. Contrast — 4.5:1 (normal text) / 3:1 (large / UI components) (§13)

### 5.1 Token-level assessment (vs white / black backgrounds)
| Token / value | Contrast (approx) | Pass 4.5:1? | Notes |
|---|---|---|---|
| `graphite.950` `#18181B` on white | ~17:1 | Yes | Primary text |
| `graphite.900` `#27272A` on white | ~15:1 | Yes | Dark surface |
| `graphite.600` `#71717A` on white | ~4.6:1 | **Borderline / yes** | Secondary text |
| `graphite.500` `#A1A1AA` on white | ~2.7:1 | **No** | Tertiary text |
| `text-dim` `#9CA3AF` on white | ~2.7:1 | **No** | Used for meta/time stamps at 10–11px (`ReviewsScreen`, `LivingScreen`, `CanvasScreen`, `OnboardingScreen`) |
| `text-muted` `#6B7280` on white | ~4.6:1 | Yes (borderline) | Secondary |
| `semantic.error` light `#DC2626` on white | ~6.3:1 | Yes | Error text |
| `semantic.warning` light `#CA8A04` on white | ~3.8:1 | **No for normal** | Warning text (should be larger or darker for AA) |
| `semantic.success` light `#16A34A` on white | ~4.8:1 | Yes (borderline) | Success |

### 5.2 Usage risks
- `var(--text-dim)` (`#9CA3AF`) used at small font sizes (10–11px) for timestamps, hints, subtitles = **fails AA**.
- Canvas node text uses `#9CA3AF` / `#F9FAFB`; at small canvas labels could drop below 4.5:1 depending on background.
- Warning badges (`#D97706` / `#CA8A04` text) may need larger font or darker token for AA.

**Phase 4 action:** Replace `text-dim` with `graphite.500` (`#A1A1AA`) only for large/non-critical text, or darken to `graphite.500` with larger size; adjust `semantic.warning` dark token for light mode.

---

## 6. Keyboard Access (§13)

| Check | Finding | Risk | File ref |
|---|---|---|---|
| All interactive elements operable by keyboard? | Most native buttons / selects / inputs yes. Custom `div role="button"` elements have `tabIndex={0}` + `onKeyDown` for Enter; some miss Space (`DashboardScreen`, `BlueprintsScreen`). | **Medium** | See §3 |
| Focus order logical? | No `tabindex` misuse detected; modal focus traps exist. | Good | `useFocusTrap.ts` |
| No keyboard traps? | No detected infinite loops; focus trap releases on unmount (need verify). | Low | — |
| Shortcuts / help visible? | `AppShell` shortcut button (`?`) has `aria-label`; dialog at `AppShell.tsx:728` lists shortcuts. | Good | `AppShell.tsx:470`, `728` |

**Phase 4 action:** Add `Space` (`e.key === ' '`) to all `div role="button"` `onKeyDown`; verify focus-trap release on dialog close.

---

## 7. Reduced Motion (§13 / §10 proposal)

| Check | Finding | Risk | File ref |
|---|---|---|---|
| `prefers-reduced-motion: reduce` media query | Present in `styles.css:1669`; disables all `transition` and `animation` globally. Good. | Good | `styles.css:1669` |
| Canvas animations / progress transitions | `LiveScreen.tsx:486` uses `transition: 'width 180ms'`; canvas selection indicators / node animations not guarded by media query (JS-driven). | **Medium** | `LiveScreen.tsx`, `CanvasScreen.tsx` |
| Auto-advancing / looping content | Not observed; onboarding progress is user-triggered. | — | — |

**Phase 4 proposal (documented, not implemented):**
- Add `window.matchMedia('(prefers-reduced-motion: reduce)').matches` guard in `CanvasScreen` render loop to suppress shadow/selection animation frames and progress-bar transition.
- Ensure `LiveScreen` progress bar uses `transition: none` when reduced-motion active (CSS class toggle or inline conditional).

---

## 8. Screen-Reader Rules (§13)

### 8.1 Not color-only
| Check | Finding | Notes | File refs |
|---|---|---|---|
| Status / badges carry text / icon? | **Yes.** Legend uses emoji (`🟩`, `🟨`, `🟥`) + text; badges combine background color with text (`Approved`, `Failed`, `Added`). | Good | `ReviewsScreen.tsx:327`, `DashboardScreen.tsx`, `GitScreen.tsx` |
| Color-only indicators? | Canvas selection uses outline + shadow + label; no pure-color-only status. | Good | `CanvasScreen.tsx` |
| Danger / warning conveyed by text? | `ErrorBoundary` shows text message + `role="alert"` on sync failures; `conflict-desc` described. | Good | `ErrorBoundary.tsx`, `ConflictDialog.tsx` |

### 8.2 Errors associated with inputs
| Check | Finding | Risk | File ref |
|---|---|---|---|
| `aria-errormessage` / `aria-describedby` linking error text to input? | **Not found**. No `aria-errormessage` in source; `aria-describedby` used only for descriptions (style/settings), not validation errors. | **Medium** | — (missing) |
| Error messages near inputs? | Toast messages (`pushToast`) used instead of inline; not programmatically associated. | **Medium** | `AppShell`, `ReviewsScreen` |
| Form validation feedback? | `LoginScreen`, `OnboardingScreen` disable buttons but do not expose `aria-live` or associated error text. | **Medium** | `LoginScreen.tsx`, `OnboardingScreen.tsx` |

**Phase 4 action:** Add `aria-errormessage` (or `aria-describedby` pointing to error node id) on validated inputs; use `role="alert"` / `aria-live="polite"` for inline errors; keep toasts for global notifications.

### 8.3 Icon labels / button labels
| Check | Finding | Risk | File ref |
|---|---|---|---|
| Icon-only buttons have `aria-label`? | Mostly yes (`Undo`/`Redo`, `Close ✕`, `Dismiss`), but some missing: `AppShell` fullscreen/present button (`title="Hide panels..."` but no `aria-label`); `LivingScreen` retry/remove (`title` present but not `aria-label` for ✕); `CanvasScreen` close library button (`Close ✕` text present, okay); some palette commands rely on `aria-label`. | **Low–Medium** | `AppShell.tsx:482`, `LivingScreen.tsx:469–470` |
| `sr-only` available? | `.sr-only` class defined (`src/styles.css:1309`); used for settings descriptions (`desc-style`, `desc-grid`, etc.). | Good | `styles.css:1309`; `SettingsGeneralScreen.tsx` |
| `aria-label` overused / redundant? | Some elements have both `aria-label` and `title`; acceptable but can simplify. | Low | — |

---

## 9. Phase 4 Checklist (Accessibility / Design System v2.0.0 §13)

- [ ] **Colors / Tokens** — Migrate `CanvasScreen` swatches, `mocks.ts`, and inline `style={{color:...}}` to `brand.violet` / `semantic.*` / `neutral.*` tokens; empty `components/` and `themes/` must be filled or documented as out-of-scope.
- [ ] **Focus-visible** — Change `focus-visible` outline from `var(--accent-cyan)` to `brand.violet.600` (`#7C3AED`) or graphite brand; add `Space` key support to all `div role="button"`.
- [ ] **Skip link** — Add `.skip-link` to DOM root (before nav/rail) pointing to `#main-content`; style `.sr-only` until focused.
- [ ] **Disabled** — Enhance `button:disabled` style (not just opacity); add `aria-describedby` for disabled-reason when applicable.
- [ ] **Contrast** — Darken `text-dim` usage or enlarge font; verify `semantic.warning` (`#CA8A04`) meets 3:1 for large / 4.5:1 for normal; check canvas label contrast under both themes.
- [ ] **Keyboard** — Audit all custom interactive divs (`DashboardScreen`, `BlueprintsScreen`, `ReviewsScreen` cards, `CanvasScreen` lint cards) for `Enter` + `Space`; verify no `tabIndex` traps.
- [ ] **Reduced-motion** — Add `matchMedia('(prefers-reduced-motion: reduce)')` guard in `CanvasScreen` animations / `LiveScreen` progress; document proposal in spec.
- [ ] **Screen-reader / Errors** — Implement `aria-errormessage` / `aria-describedby` linking for login/onboarding/connection validation; expose inline errors with `role="alert"` or `aria-live`; verify all icon-only buttons have `aria-label` (full audit of `AppShell`, `LivingScreen`, `CanvasScreen`).
- [ ] **Color-only** — Confirm legend, badges, and status pills always include text/icon; no pure-color-only alerts.
- [ ] **Documentation** — Update `docs/PHASE0_INVENTORY.md` and `UI_UX_SPEC.md` (§11 quality bars / §13 QA matrix) with these findings; link to this audit file.

---

## 10. Risk Summary (ordered by severity)

| # | Risk | Severity | Primary file(s) |
|---|---|---|---|
| 1 | Focus outline not brand (cyan); missing skip-link; some `role="button"` miss Space | **Medium** | `styles.css`, `DashboardScreen`, `AppShell` |
| 2 | Hardcoded canvas/inline colors bypass design-system tokens; empty `components/` / `themes/` | **Medium** | `CanvasScreen.tsx`, `mocks.ts`, `design-system/` |
| 3 | Errors not programmatically associated with inputs (`aria-errormessage` absent) | **Medium** | All forms / screens |
| 4 | `text-dim` (`#9CA3AF`) at small size fails 4.5:1; `semantic.warning` may fail normal text | **Medium** | `styles.css`, `ReviewsScreen`, `LiveScreen`, `CanvasScreen` |
| 5 | Disabled only opacity 0.5; no enhanced visual cue or reason text | **Low–Medium** | `styles.css` |
| 6 | Some icon-only buttons missing `aria-label` (rely on `title` only) | **Low** | `AppShell.tsx`, `LivingScreen.tsx` |
| 7 | Reduced-motion media query exists but canvas JS animations / progress not guarded | **Low** | `CanvasScreen.tsx`, `LiveScreen.tsx` |

---

*Audit completed. No source files edited (documentation-only per instruction). Recommend Phase 4 implementation start with focus-visible + skip-link + error association (largest user impact).*
