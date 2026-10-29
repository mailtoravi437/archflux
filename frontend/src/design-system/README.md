# ArchFlux Design System

Locked at `src/design-system`. Ownership defined in `docs/design/design-system-ownership.md` (§14.1–14.3).

## Quick usage

```ts
import { colors, spacing, typography } from 'src/design-system';

// Token consumption only — no raw hex in shared UI
const buttonStyle = {
  backgroundColor: colors.accent.cyan,
  padding: spacing.md,
  fontSize: typography.size.base,
};
```

## Barrel exports (`index.ts`)

- `tokens` → colors, spacing, typography, radii, shadows, motion
- `types` → ThemeName, TokenSet
- `validateTokens` → automated validation (CI-required)
- `components` → ThemeProvider, Button, Input, Badge, Tabs, Card
- `themes` → lightTheme, darkTheme

## Rules at a glance

- All shared UI consumes tokens; hardcoded per-screen bg is prohibited.
- Component variants allowed if documented; inconsistent radii / independent button styling is blocked.
- Raw hex only for user-selectable palettes and canvas grid (§14.1).
- Do not scatter theme styling outside this folder; import from `src/design-system`.
