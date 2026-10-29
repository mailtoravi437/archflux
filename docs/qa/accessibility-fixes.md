# Accessibility Fixes — ArchFlux v2.0.0 (Phase 4)
**Fixed:** 2026-10-17  
**Audit source:** `docs/qa/accessibility-audit.md` (§3–§9)  
**Scope:** `src/styles.css`, `src/screens/CanvasScreen.tsx`, `src/screens/LivingScreen.tsx`, `src/components/AppShell.tsx`, `src/screens/LoginScreen.tsx`

---

## 1. Focus-visible → brand outline (`styles.css:1667`)
**Before:** `outline: 2px solid var(--accent-cyan);`
**After:** `outline: 2px solid var(--accent-violet, #7C3AED);`
**Snippet:**
```css
input:focus-visible, button:focus-visible, select:focus-visible {
  outline: 2px solid var(--accent-violet, #7C3AED);
  outline-offset: 1px;
}
```
**Ref:** `src/styles.css:1667`

---

## 2. Disabled → token colors + `aria-disabled` (`styles.css:1632`)
**Before:** `button:disabled { opacity: 0.5; cursor: not-allowed; }`
**After:** unified rule with `var(--text-dim)` / `var(--border-panel)` and `[aria-disabled="true"]` selector.
**Snippet:**
```css
button:disabled, [aria-disabled="true"] {
  opacity: 0.55; cursor: not-allowed;
  color: var(--text-dim); border-color: var(--border-panel);
}
```
**Refs:** `src/styles.css:1632` + `AppShell.tsx:473-474` (added `aria-disabled` to Undo/Redo)

---

## 3. Reduced-motion JS guard — canvas + progress (`CanvasScreen.tsx`, `LivingScreen.tsx`)
**Canvas:** suppress `shadowBlur` / `shadowColor` when `matchMedia('(prefers-reduced-motion: reduce)').matches` inside draw loop.
**Snippet (`CanvasScreen.tsx:807-810`):**
```tsx
const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// ... after ctx.save()
if (reducedMotion) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
```
**Living progress (`LivingScreen.tsx:486`):** transition becomes `'none'` when reduced-motion active.
**Snippet:**
```tsx
transition: typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'width 180ms'
```

---

## 4. `aria-errormessage` association (`LoginScreen.tsx`)
Added `id="login-error"` to error banner (`LoginScreen.tsx:648`) and `aria-errormessage={error ? "login-error" : undefined}` to email / OTP inputs (`LoginScreen.tsx:443,588`).
**Snippet:**
```tsx
<div id="login-error" style={{...}}>{error}</div>
<input aria-errormessage={error ? "login-error" : undefined} ... />
```

---

## 5. Icon-labels (`AppShell.tsx`, `LivingScreen.tsx`)
Added missing `aria-label` to icon-only / text-only buttons.
**Refs / snippets:**
- `AppShell.tsx:482`: `aria-label="Hide panels and go fullscreen"`
- `LivingScreen.tsx:469`: `aria-label="Retry connector sync"`
- `LivingScreen.tsx:470`: `aria-label="Remove connector"`

---

## 6. Selection not color-only (`CanvasScreen.tsx`)
Selection already uses `outline` + `shadow` + floating toolbar labels (`selectedId` / `selectedEdgeId` / `selectedText`). Added `aria-label` to toolbar container and kept non-color indicators intact. Confirmed legend / badges include text/icons (`ReviewsScreen`, `DashboardScreen`). No pure-color-only status indicators remain.

---

## 7. Disabled buttons — `aria-disabled` pairing (`AppShell.tsx`)
Undo/Redo buttons now carry both `disabled={!canUndo}` and `aria-disabled={!canUndo}` for screen-reader consistency (`AppShell.tsx:473-474`).

---

## Cross-reference to audit
| Audit § | Issue | Fix file(s) | Lines changed |
|---|---|---|---|
| §3 Focus-visible | Cyan outline | `src/styles.css` | 1667 |
| §4 Disabled | Only opacity | `src/styles.css`, `AppShell.tsx` | 1632; 473-474 |
| §7 Reduced-motion | Canvas / progress unguarded | `CanvasScreen.tsx`, `LivingScreen.tsx` | 807-810; 486 |
| §8.2 Errors | No `aria-errormessage` | `LoginScreen.tsx` | 443, 588, 648 |
| §8.3 Icon labels | Missing `aria-label` | `AppShell.tsx`, `LivingScreen.tsx` | 482; 469-470 |
| §8.1 Color-only | Selection / badges | `CanvasScreen.tsx` (verified) | — |

---
*Document created to satisfy Phase 4 checklist from `docs/qa/accessibility-audit.md` §9.*
