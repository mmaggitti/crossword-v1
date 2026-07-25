# Layout tests

jsdom renders the DOM but computes no geometry, so layout bugs pass every
unit test and land on the phone instead. These measure real boxes in real
engines, so jsdom is not used here at all.

The suites are **`.cjs`** (CommonJS, run under bare `node`) and run against
the **served Vite build**. `_serve.cjs` is a tiny dependency-free static
server; each suite serves `apps/player/dist` over HTTP and drives the browser
against `http://127.0.0.1:<port>/#sample` (the engine's built-in sample). This
replaced loading the old inlined single file over `file://`, which browsers
refuse for ES-module `<script>` tags — **the tests serve `dist`, they never
open `dist/index.html` directly.**

```bash
# from the repo root (recommended): pretest builds dist, then runs all 10
npm test

# from apps/player, one suite at a time (build dist first if it's stale):
npm run build
node test/layout-test.cjs                 # geometry, Chromium
ENGINE=webkit node test/layout-test.cjs   # geometry, Safari's engine
node test/paint-test.cjs                   # pixel check under the dock
ENGINE=webkit node test/paint-test.cjs
```

The ten suites: **layout, paint, typing, clue, advance, kbd, stuck, solve,
wrong, theme** — plus `_serve.cjs` (the static server).

**layout-test.cjs** — across four viewports and both keyboard states, asserts
the grid fits its stage on both axes, cells stay square, the app fills the
viewport, and the page cannot scroll.

**paint-test.cjs** — lifts the dock, screenshots the strip it vacated, and
decodes every pixel. Any non-canvas colour there means grid rows are showing
through, which is the ghosting bug.

**theme-test.cjs** — the purple variant shipped at `/crossword-v1/purple/`. The
theme is pure CSS (a `.theme-purple` block in `TOKENS` applied to `<html>`), so
this needs no second build: it loads the ordinary `dist/`, adds the class, and
reads the values back. Everything asserts *used* values (`rgb(r, g, b)`), never
raw custom-property text — reading the used value is what proves the ancestor
class actually won the cascade. The two contrast assertions are the point:
vivid `#A100FF` on its own `#E6DCFF` tint is 4.05:1, under AA in both
directions, so the palette re-points `--accent-ink` (text on a tint → 6.37:1)
and `--on-accent-quiet` (quiet text on an accent fill → 5.30:1). Collapsing
either back to `var(--accent)` fails here.

**All nine gate.** Every suite ends in `process.exit(1)` on failure
(previously only `layout` and `paint` did), so a regression in any of them
fails `npm test` and, in CI, blocks the deploy. `npm run test:webkit` runs
`layout` + `paint` under WebKit.

## What these still can't catch

Headless WebKit has no software keyboard. The `--kb` value is injected
directly, so the real iOS keyboard interaction — and the timing races around
it — is not reproduced here. That class of bug still has to be caught on a
device.
