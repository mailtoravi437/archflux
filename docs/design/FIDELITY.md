# Design fidelity check (`npm run design:shots`)

The artboards in [`artboards/`](artboards/README.md) are the source of truth for how the UI looks.
Every UI task in [EPIC-14](../specs/impl/r1/EPIC-14-design-fidelity.md) has a **Fidelity
checklist**. The reviewer ticks it by comparing a screenshot of the real app with the artboard, side
by side. This page describes the tooling (R1-E14-T06) and the comparison.

## 1. Produce the screenshots

```bash
cd frontend
npm run design:shots
```

The script is [`frontend/scripts/design-shots.mjs`](../../frontend/scripts/design-shots.mjs). It does
the following:

- **Port:** it starts Vite on port **5191** with `--strictPort`. If 5191 is busy it exits with an
  error and does not try another port. It never uses 5173, 3001, 8080 or 18080. The dev API proxy
  points at a closed port, so no request reaches the owner's backend.
- **Seed data:** it seeds localStorage with a guest session (`archflux:session` = `{"mode":"guest"}`)
  and a fixture doc in `archflux:v2-light`. The fixture is built from
  `src/tests/fixtures/sampleDiagram.ts`, which is test-only data and never ships in the product.
- **View state:** it uses the light theme, `pan {0,0}` and `zoom 1`, so node positions are
  predictable.
- **Capture:** it captures at **1440×900** into `frontend/test-results/design-shots/`.
- **Cleanup:** it stops Vite even when a step fails, and exits 0 on success.

Afterwards, `lsof -i :5191` should print nothing.

## 2. What each shot is compared against

| PNG | App state | Artboard (region) | EPIC-14 task |
|---|---|---|---|
| `appbar-canvas.png` | top 48 px of `#/canvas` | [AppBar.dc.html](artboards/AppBar.dc.html) (whole; doc switcher shown) | T01 |
| `appbar-library.png` | top 48 px of `#/dashboard` (Library) | [AppBar.dc.html](artboards/AppBar.dc.html) (no doc switcher) | T01 |
| `canvas-empty.png` | `#/canvas` with a blank doc | [Main.dc.html](artboards/Main.dc.html) L69–L170 (rail, view toolbar, minimap, canvas frame) | T02. The empty state must stay honest. |
| `canvas-selected.png` | `#/canvas` with the fixture, first node (Client Gateway) clicked | [Main.dc.html](artboards/Main.dc.html) L170–L237 (inspector), [DisplayStyles.dc.html](artboards/DisplayStyles.dc.html); nodes vs [Elements.dc.html](artboards/Elements.dc.html) card M and [States.dc.html](artboards/States.dc.html) selected | T02, T03, T05 |
| `canvas-nothing-selected.png` | `#/canvas` with the fixture, nothing selected, outline open | [States.dc.html](artboards/States.dc.html) "Inspector, nothing selected" | R1-E14-T08 |
| `appbar-long-title.png` | `#/canvas` with a 70-character document title | [AppBar.dc.html](artboards/AppBar.dc.html) (title capped at 240 px) | R1-E14-T08 |
| `library.png` | `#/dashboard` with the fixture doc | [Library.dc.html](artboards/Library.dc.html) (whole) | T04 |
| `sync.png` | `#/living` with the fixture (guest) | [Sync.dc.html](artboards/Sync.dc.html) (both frames; the fixture adds two drift rows) | R1-E14-T11 |
| `live-tab.png` | `#/canvas`, Live dock tab, guest session | [Live.dc.html](artboards/Live.dc.html) "R1 STATE" (Guest card) | R1-E14-T11 |
| `home.png` | `#/home`, written only when that route exists | [Home.dc.html](artboards/Home.dc.html) | the Home task, once `/home` is built |

`home.png` is skipped while `#/home` redirects elsewhere. The script logs `skip home.png`.

## 3. How the reviewer compares

1. **Open the artboard.** Use the Claude Design canvas
   (https://claude.ai/artifact/JsPYiRas4WwTm2SpEHK9gu), scrolled to the artboard listed above, at
   100% zoom. The canvas link renders the templates, which the raw `.dc.html` files need.
2. **Open the PNG.** Open it at 100% next to the artboard. Both are 1440 px wide, so you can compare
   them pixel for pixel. For the 48 px app-bar crops, compare with the 1440×48 AppBar artboard.
3. **Walk the checklist.** Go through the task's **Fidelity checklist** in EPIC-14 item by item:
   - structure and order of controls;
   - px sizes, radius, border and shadow;
   - colours (as tokens);
   - font size and weight;
   - copy, verbatim.

   When a value is unclear in the picture, read it from the artboard markup. The inline styles are
   exact.
4. **Ignore sample content.** Ignore the artboard's sample data (checkout-mesh.arch, "Ravi") and the
   fixture's node names. Compare the chrome and the rendering, not the data.
5. **Verdict.** Tick every item, or fail review and name each miss with the artboard line. An
   off-design UI fails review even when every test passes (AGENTS.md §3).
6. **Attach the PNGs.** Attach the PNGs you compared to the review.

Visual-regression baselines (`e2e/visual-regression.spec.ts`) are a separate gate. Re-baselining
them needs human approval (R1-E14-T07).
