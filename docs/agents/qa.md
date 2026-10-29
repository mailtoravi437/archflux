# QA playbook

**Job:** after a wave or epic is marked done, find what the tests missed, the way a demanding user
would.

**Steps:**
1. Run the app on non-owner ports. The frontend dev server goes on 5191:
   `npx vite --port 5191 --strictPort`. The backend runs as compose project `archflux-qa`.
2. For each task done in the wave, follow its **Acceptance** by hand in the browser at 1440×900 and
   390×844, with keyboard only and then with the mouse.
3. Check the cross-cutting rules:
   - empty, loading and error states use the SC-56 patterns;
   - there is no fake data;
   - focus is visible;
   - no text overflows or is clipped;
   - dark and light themes both work;
   - reload keeps state;
   - the offline toggle (DevTools) shows the offline banner.
4. Compare with the design artboard named in the task (PRODUCT_SPEC §6.1 canvas link).
5. Record each problem as a row in BACKLOG "Bugs found by the release gate":

```
| R1-BUG-07 | QA wave 2 | Icon style: long names overlap the selection ring at 390px (R1-E02-T04) | todo |
```

   Include repro steps, expected vs actual, and the viewport and theme in the epic's
   **Open questions**.
6. Don't fix bugs yourself. A bug fix is a new task: the spec writer adds it if the spec was wrong,
   and an implementer takes it otherwise.
