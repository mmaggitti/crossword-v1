# Crossword Player — handover

**Status:** v1.1 shipped and live. **Live at:** `https://mmaggitti.github.io/crossword-v1/`
**Repo:** `mmaggitti/crossword-v1` (npm-workspaces monorepo; GitHub Actions → GitHub Pages)

This document is the complete context for picking the project up. It supersedes the earlier single-file handover, which described the retired iPhone-upload build.

v1.1 is deployed **into** the `crossword-v1` repo, overwriting the retired single-file v1 that used to live there. There is no separate predecessor repo — just this one. Every share link ever minted against `…/crossword-v1/#p=…` keeps resolving, because v1.1 decodes the identical `#p=` share format; that's backward compatibility, not a frozen copy. The old single-file v1 remains in the repo's git history.

---

## 1. What it is

A mobile-first crossword **player** — not a constructor. Puzzles arrive as JSON, either bundled with the app or encoded into a share link. It installs to a home screen, works offline, and is a PWA served as a normal Vite build.

As of v1.1 the whole thing is an **npm-workspaces monorepo**: a shared engine (`@crossword/core`) and the apps built on it (`apps/*`). Today there is one app — the player. A second, ClueBattle, is at the design stage (§12).

**New in v1.1:** the 10 hand-authored minis are bundled and reachable through a picker, so the app is playable on first open rather than share-link-only.

Deliberately **not** in scope, so far: puzzle authoring, saved progress, timers, check/reveal beyond whole-puzzle, accounts, a backend.

---

## 2. The monorepo, and why

One repo, two package roots, workspaces declared at the top:

```
crossword/                        the mmaggitti/crossword-v1 repo
├── package.json                  workspaces: ["apps/*", "packages/*"]; scripts delegate to the player
├── .github/workflows/deploy.yml  CI: test-gated deploy to Pages
├── packages/
│   ├── core/                     @crossword/core — the shared engine (no app chrome)
│   │   └── src/{CrosswordPlayer.jsx, share.js, index.js}
│   └── clue-data/                @crossword/clue-data — bundled content
│       ├── index.js                exports { minis, minisById }
│       ├── minis/mini-001.json … mini-010.json   generated from ../../mini-crosswords.md
│       └── clue-bank.json          the 1,574-word pool the minis were filled from (reference, not imported at runtime)
├── apps/
│   └── player/                   the player app; consumes @crossword/core + @crossword/clue-data
│       ├── index.html  vite.config.js  package.json
│       ├── src/{main.jsx, App.jsx, Picker.jsx}
│       └── test/                   9 Playwright suites (.cjs) + _serve.cjs
├── docs/color-spec-11.md         the §11 palette (unchanged)
├── mini-crosswords.md            the minis in prose; the source for packages/clue-data/minis
├── HANDOVER.md  README.md
└── _collateral/                  research + the xd-*.zip corpora (git-ignored)
```

**Why a monorepo.** The player used to be one Vite project (`xw/`) that a separate `build.js` inlined into a single deployable HTML file. That whole apparatus is gone. The engine and the app now live side by side as packages so a second app (ClueBattle) can consume the same parser, play-state hook, renderer, and design tokens without a copy.

**Why the app consumes the engine's *source*.** `apps/player/vite.config.js` aliases `@crossword/core` and `@crossword/clue-data` to their source entry points (`packages/core/src/index.js`, `packages/clue-data/index.js`) and excludes them from `optimizeDeps`. That is deliberate: JSX shipped inside a `node_modules` package would not be transformed, but source pulled in through the alias is compiled by `@vitejs/plugin-react` as first-party code. Editing the engine is a normal edit — no build/publish step between packages.

**Local dev — all from the repo root:**

```bash
npm install            # installs the whole workspace
npm run dev            # player dev server, localhost:5173, no service worker
npm run build          # vite build -> apps/player/dist
npm test               # pretest builds a fresh dist, then runs all 9 suites
npm run test:webkit    # geometry + paint in Safari's engine
```

The root scripts (`dev`, `build`, `test`, `test:webkit`) delegate straight to the player workspace. The player's own scripts are `dev`, `build`, `preview`, `test`, `test:webkit`; `pretest`/`pretest:webkit` run `vite build` first, so `npm test` always exercises a freshly built dist, never a stale one.

---

## 3. Architecture

Three layers, strictly ordered — all of them now inside `@crossword/core` (`packages/core/src/CrosswordPlayer.jsx`). The separation is load-bearing: it's what would let a Three.js renderer drop in without touching the model, and it's why a second app can share the engine.

```
parsePuzzle(json)   pure fn   geometry: solution, runs, numbering, entries, cellIndex
usePuzzle(json)     hook      play state: cursor, letters, marks, navigation
<GridDOM> et al.    view      one consumer of the above
```

`parsePuzzle` and `usePuzzle` contain **no DOM references**. Protect that deliberately; the temptation is to let a measurement leak upward.

**Exported surface.** `packages/core/src/index.js` exports the default `CrosswordPlayer` component, `parsePuzzle`, `TOKENS` (the §11 design-system CSS), and the whole share codec (`share.js`). `usePuzzle` and `GridDOM` are intentionally **module-private** for now — they become exports the moment a second consumer (a ClueBattle constructor) needs to drive them directly.

### Renderer contract

```js
({ model, cursor, letters, wrong, solved, celebrating, onCellTap }) => ReactNode
```

`GridDOM` is pure — it emits `--cols` and `--rows` as CSS custom properties and nothing else. **It measures no grid geometry in JavaScript;** cell size is computed by the layout engine from container-query units (§6).

### Entry detection

A **maximal horizontal or vertical run of length ≥ `minEntryLength`** is an entry. Shorter runs are legal cells that are simply unchecked in that direction — no number, no clue. That single parameter is what makes minis (`2`) and standard American grids (`3`) the same code path.

The app does **not** enforce construction rules — full checking, all-over interlock, symmetry. It will happily render a grid no editor would accept. That's intentional; validation of construction is a separate concern (backlog B7).

---

## 4. Puzzle JSON schema, v1

```json
{
  "schemaVersion": 1,
  "id": "mini-001",
  "title": "Mini 001",
  "author": "Mark",
  "date": "2026-07-19",
  "size": { "rows": 5, "cols": 5 },
  "minEntryLength": 2,
  "grid": ["..RHO", ".SEAL", "SCARE", "PACE.", "ART.."],
  "clues": {
    "across": { "1": "Greek letter after pi", "4": "…" },
    "down":   { "1": "Respond", "2": "…" }
  }
}
```

- `grid` holds the **solution**. The player blanks it and compares on check. There is no separate answer list to keep in sync.
- `.` is a block; `#` and space are accepted and normalised. Letters are uppercased on parse.
- `size` is optional but supplying it turns ragged rows into a validation error, which is why you want it.
- **Numbering is derived, never authored** — row-major scan, next number when any entry starts at that cell. Clues are keyed to those numbers.

Validation reports both directions of mismatch (`Missing clue: 4A (SEAL).` / `Clue 9D has no entry in the grid.`) in an amber panel under the header. It never blocks play.

The 10 bundled minis (`packages/clue-data/minis/mini-0NN.json`) are exactly this shape, generated from `mini-crosswords.md`. `packages/clue-data/index.js` re-exports them as `minis` (array) and `minisById` (keyed on `id`). `clue-bank.json` in the same package is the 1,574-word pool the minis were filled from — a construction reference, not imported by the running app.

### Share links

`share.js` (now in `packages/core/src`) encodes the whole puzzle into the URL hash as base64url: `…/#p=eyJzY2hlbWFW…`. No server, no database, no deploy needed to send someone a puzzle. The hash fragment rather than a query string is deliberate — fragments never reach the host, so puzzle contents stay out of access logs.

Sizes: a 5×5 mini is ~600 characters. A 15×15 with 78 clues lands near 5,250, past what messaging apps handle. If you go beyond minis, add a `CompressionStream("deflate-raw")` step — it's ~70% and brings a 15×15 to ~1,700 chars. It's left out of v1 because it makes encode/decode async, which ripples into the component's initial-state read.

---

## 5. Design system

The palette comes from an external spec, §11, a role-based colour system the user maintains separately. **Read `docs/color-spec-11.md` before changing any colour.** It ships in `@crossword/core` as the `TOKENS` string, so the player and the picker (and any future app) share one source of truth. Key rules that constrain this app:

- One live accent element per unit. One primary action per view.
- **The accent never means good or bad.** State speaks through the status trio.
- Status and data colours are fills paired with black text — never coloured text on white.

### Judgment calls already made — don't silently reverse these

| Decision | Reasoning |
|---|---|
| `status-ok` is **unused** | Leaf `#B8DAAE` sits 15.6° from the accent, and the spec's own Appendix A.3 names small swatches as where that separation fails. A crossword cell *is* that swatch. Only wrong cells are marked; correct ones stay unstyled. |
| Solved state uses accent | §11.2 assigns *task progress* to the accent and *threshold measurements* to status colours. A finished puzzle is a completed task. It's also unmistakably "good", which the accent isn't supposed to signal — the two rules genuinely conflict here and the task reading won. |
| Three accent-family elements on screen | Cursor cell, clue pill, Check button. Read as one live element per unit (grid / clue / actions). More green than the spec's default posture, and the user has explicitly said he wants to keep it. |
| Clue pill: `accent` on `accent-softest` | 5.07:1. Passes AA for normal text, short of AAA. `accent-deep` on the same fill would clear 7:1 if more headroom is ever wanted. |

### Typography

Type was the one axis the spec left open, so it carries an idea: **mono for grid material** (letters, cell numbers, entry labels, the size readout), **sans for language material** (clue text, buttons, banners). System stacks, not webfonts — no FOUT, no network dependency.

---

## 6. Layout invariants

These are the things that will silently break if you change them without measuring. Most of them cost real debugging time to find.

**Everything derives from two parameters.** `--u` is the root unit; every text size, padding, radius and hairline is a named multiple of it. `--cell` is derived in CSS from the stage's container size:

```css
--cell: min(
  calc(100cqw / var(--cols)),
  calc(100cqh / var(--rows)),
  calc(var(--u) * var(--cell-max))
);
```

The stage is `container-type: size`, so `100cqw`/`100cqh` *are* its inner dimensions. **There are no hardcoded pixel values in the UI** — this is an explicit and firmly held user requirement. The only survivors are `max(1px, …)` floors on hairlines, `16px` on the hidden input (the iOS threshold below which focusing zooms the page), and `0px` fallbacks inside `env()`.

**No *grid-geometry* measurement in JS — cell size is pure CSS.** The grid's size, position, and squareness are computed entirely by the layout engine from the container-query units above; JS never measures the board. That is the invariant, and it is narrower than "no measurement in JS" — the app *does* measure two things in JavaScript, and both are legitimate:
- **`--kb`, the keyboard inset**, is read from `window.visualViewport` (`innerHeight − visualViewport.height`) and written back as a CSS variable. The layout viewport doesn't shrink when the keyboard opens; only the visual viewport does, so this difference is the only way to know the keyboard's height.
- **Tap slop** reads `window.innerWidth`/`innerHeight` to size the drag threshold as a fraction of the viewport rather than a pixel count.

Neither touches the grid. The rule is that *board geometry* stays in CSS, not that JS never calls a measurement API.

**`.xw` is `position: fixed; inset: 0`** (`CrosswordPlayer.jsx`, ~line 95). It fills the layout viewport and pins there; `svh` appears nowhere in the file. *(Correction: earlier revisions of this doc claimed `.xw` was `position: absolute; height: 100svh` and "never `fixed`". The shipped code has always been `fixed; inset: 0` — the doc had drifted from the code, and this is the corrected statement.)* What keeps the software keyboard from resizing the board is **not** a positioning trick but the transform-based dock, below.

**The dock rides on a `transform`.** `.xw-dock` is lifted above the keyboard with `transform: translateY(calc(-1 * var(--kb)))`. Transforms take no part in layout, so lifting the control strip cannot move or resize the board — the board keeps its full `fixed` box while the controls slide up over the vacated space. A `::after` at `top: 100%` backfills canvas below it — without that, grid rows show through the strip the dock vacates.

**Reserved heights are load-bearing.** Three places reserve space so that content changes can't shift the board:
- The clue bar reserves two lines (`--u * 4.35`, `* 3.45` while typing). A clue that wraps must not grow it.
- The Check button reserves two lines. "Fill every square to check answers" wraps; "Check puzzle" doesn't. Without the reserve the row jumps height the instant the last square is filled.
- The stage reserves a band for the SOLVED mark, so solving can't resize the board.

**If you change any of those strings or sizes, re-run the tests.** They check exactly this.

**Typing mode.** When a keyboard is on screen (`--kb > 0`), `.xw.typing` sheds the header, the clue metadata line, and vertical padding — roughly 76px — and the stage reserves the keyboard's own height so the board gives up *only the shortfall*. Measured cost: no shrink on iPad, ~4% on a 15 Pro Max, 8% on a 13 mini, 40% on an SE, 62% in landscape. Whole board visible in every case.

**Input model.** A hidden `<input>` raises the real keyboard. Characters are read from `input` events, not keydown — iOS software keyboards report `key: "Unidentified"`. A sentinel character is kept in the field, without which iOS stops emitting delete events once it's empty. Cells refuse `pointerdown` *and* `mousedown`: WebKit doesn't reliably suppress compatibility mouse events, and a stray `mousedown` blurs the input a few ms after focus. Selection commits on pointer-**up** and only if the finger stayed within ~2% of the viewport, so a drag can't move the cursor.

**iOS can dismiss the keyboard while leaving the input focused.** In that state `focus()` is a no-op and the keyboard never returns. `focusInput` detects it and forces a blur→focus transition. The `kbdOn` optimistic flag self-corrects after 700ms on coarse-pointer devices if no keyboard materialises.

---

## 7. Testing — read this before writing any UI code

**jsdom is not sufficient and was actively misleading.** Three layout fixes shipped and failed on the device because jsdom renders the DOM but computes no geometry — every one of them passed its unit test. The Playwright harness exists because of that, and jsdom is still not used anywhere.

The suites live in `apps/player/test/`, are **`.cjs`** (CommonJS, run under bare `node`), and run against the **served Vite build**, not a single file:

```bash
npm test        # from the repo root: pretest builds apps/player/dist, then runs all 9 suites
```

Under the hood each suite starts `_serve.cjs` — a tiny dependency-free static server — pointed at `apps/player/dist`, then drives Chromium/WebKit against `http://127.0.0.1:<port>/#sample` (the engine's built-in sample route). This replaced loading the old inlined single file over `file://`, which browsers refuse for ES-module `<script>` tags. **The tests serve `apps/player/dist` over HTTP; they never open `dist/index.html` directly and there is no single-file build any more.**

The nine suites:

| Suite | Checks |
|---|---|
| `layout-test.cjs` | Grid fits its stage on both axes, cells square, app fills viewport, page can't scroll — 4 viewports × 2 keyboard states, Chromium (and WebKit via `ENGINE=webkit`). |
| `paint-test.cjs` | Lifts the dock, screenshots the strip it vacated, decodes every pixel — any non-canvas colour is the ghosting bug. |
| `typing-test.cjs` | Board stays visible + measured shrink cost across devices. |
| `clue-test.cjs` | Clue bar can't resize the board across all clues. |
| `advance-test.cjs` | Entry order and pill alignment. |
| `kbd-test.cjs` | Keyboard raise/dismiss cycle. |
| `stuck-test.cjs` | Wedged-focus recovery. |
| `solve-test.cjs` | Both solve phases, board stability. |
| `wrong-test.cjs` | Failed-check recovery path. |

**All nine now gate.** Each suite ends in `process.exit(1)` on failure (previously only `layout` and `paint` did), so a regression in any of them fails `npm test` and, in CI, blocks the deploy. `npm run test:webkit` runs `layout` + `paint` under WebKit's engine.

**What they still can't catch:** headless WebKit has no software keyboard. `--kb` is injected directly, so the genuine iOS keyboard interaction — and the timing races around it — still need a device. Several fixes in §6 are reasoned from documented WebKit behaviour rather than measured.

---

## 8. Revision history

Roughly chronological. The *why* matters more than the *what*.

**Foundation**
1. Initial build — player, headless model + swappable renderer, mini-first, N×M parameterized, §11 palette, mobile-first. Whole-puzzle check only, by choice; everything else went to a backlog.
2. Fixed a syntax error: backticks inside a CSS template literal terminated the string 550 lines early.

**Shipping (v1, the single-file era — now retired)**
3. PWA conversion — Vite + `vite-plugin-pwa`, manifest, service worker, icons, share-via-URL-hash.
4. Pre-built single-file bundle (React inlined, 5 flat files) so deployment worked from a phone with no build step.
5. Deployment path settled: GitHub Pages via mobile Safari, uploading `index.html` by hand.
6. Service worker: wait-then-prompt update flow with a Reload banner, since cache-first meant deploys never reached anyone.
7. Switched navigations to network-first with `cache: "reload"`.

**Layout, the hard part**
8. Grid rows were content-sized, so a row grew when it got its first letter. Fixed with explicit `grid-template-rows`, `line-height: 1`, `min-height: 0`, `overflow: hidden`.
9. Replaced the custom on-screen keyboard with the native iOS one (hidden input, `visualViewport` tracking, Type/Hide toggle).
10. A wrapper div added for tap-outside-to-dismiss collapsed the grid to a tiny square — flex item with auto width, so `width: 100%` resolved against zero.
11. Replaced viewport-height resizing with a transform-based dock, so the keyboard stops affecting the board.
12. Ghost grid below the dock: percentage + `aspect-ratio` sizing was never deterministic. Moved to measured pixels, clipped the stage, made the page unscrollable.
13. Removed all hardcoded pixels at the user's request — token scale, container-query units for `--cell`, `--kb` as a CSS variable, proportional keyboard threshold.
14. **Installed Playwright (Chromium + WebKit).** Caught a real backfill bug: a `box-shadow` backfill *translated* a full viewport down instead of stretching, so it painted off-screen — replaced with a `::after`. *(An earlier note here claimed a `position: fixed` re-anchoring bug was found and fixed by switching away from `fixed`. That was never true: `.xw` shipped as `position: fixed; inset: 0` from the start and still is — the keyboard is handled by the transform dock, not a positioning switch. §6 has the corrected account.)*

**Interaction and polish**
15. Clue moved above the board, weight 600 in flagship green.
16. Fixed the Hide button — it read stale state (tap blurred on pointerdown, React re-rendered, click fired the opposite action), and cell taps weren't focusing at all because the browser's mousedown handling stole focus back.
17. Clue became a pill. Discovered the token scale was pinned at its clamp floor on every phone (`2.4vmin` on a 430px screen is 10px) — rebased to `0.85rem + 0.9vmin`. **The whole UI had been undersized.**
18. Pill left-aligned with the header title, nav arrows grouped at the trailing edge.
19. Auto-advance stays in direction (`2A → 3A`) — entries now sort by direction then number. Completed entries are skipped when advancing; the arrows still visit them.
20. Clue bar de-panelled onto the canvas; board top-anchored so the clue sits directly above it.
21. Solve celebration: full-board green stamp for 1.5s, then a persistent SOLVED mark below. Reduced-motion users skip the stamp.
22. Drags no longer move the cursor. Hardened against iOS visual-viewport panning.
23. **Typing mode** — sheds header and clue metadata when the keyboard is up, plus a cell-size ceiling and shortfall-only shrink, so the whole board stays visible on every device.
24. Removed the swap control and the 3×3 sample; 5×5 only.
25. Dropped `min 2` from the header (a construction parameter, meaningless to solvers). Relabelled to "Fill every square to check answers" and "Keyboard".
26. Fixed an intermittent keyboard glitch with three compounding causes: compatibility `mousedown` blurring the input, `focus()` being a no-op on an already-focused input, and the optimistic flag never clearing.
27. Smaller pill, "Clue 5A" label, removed the tick/progress counters — next to a green pill, `1/5` read as a score.
28. Cell taps no longer raise the keyboard, by request; the toggle is the only way.
29. Wrong-state banner stacked *above* the controls rather than replacing them — it had been taking the keyboard toggle with it, leaving no way to fix anything.

**v1.1 — monorepo, bundled minis, CI/CD**
30. **Monorepo restructure.** Split the single `xw/` Vite project into an npm-workspaces monorepo: `packages/core` (`@crossword/core` — the parser, play-state hook, DOM renderer, share codec, and `TOKENS`) and `apps/player` (the app). The three layers moved wholesale into the shared engine so a second app can consume them.
31. **Retired the single-file pipeline.** Deleted `build.js`, `vendor/` (inlined React UMD), and `site/` (the pre-built ship artifact). Nothing is inlined by hand any more; the app is a normal Vite build.
32. **Vite build for the engine, tests repointed and hardened.** Apps consume `@crossword/core`/`@crossword/clue-data` through a Vite *source* alias (so plugin-react transforms their JSX as first-party). The Playwright suites were rewritten from `.js`-reading-`dist/index.html`-over-`file://` to `.cjs` serving `apps/player/dist` over HTTP via `_serve.cjs`, and every suite now `process.exit(1)`s on failure so all nine gate.
33. **Bundled 10-minis picker + hash router.** `packages/clue-data` bundles the 10 minis (generated from `mini-crosswords.md`). `apps/player/src/App.jsx` is a hash router: `#p=…` shared puzzle, `#<mini-id>` a bundled mini with a back button, `#sample` the engine's built-in sample, empty → the `Picker`. The app is now playable on first open, not share-link-only.
34. **GitHub Actions CI/CD to `/crossword-v1/`.** Push to `main` runs `npm ci`, installs Playwright browsers, runs the full suite (gate), rebuilds with `BASE_PATH=/crossword-v1/`, and deploys `apps/player/dist` to GitHub Pages. The manual iPhone upload is gone. This ships **into** the `crossword-v1` repo, overwriting the retired single-file v1; because v1.1 decodes the identical `#p=` share format, every old `…/crossword-v1/#p=…` link keeps resolving — backward compatibility, not a separate frozen repo.

---

## 9. Working with Mark

**Response style.** Dense and technically rigorous. Structured bullets over prose paragraphs. Explicit caveats and honest uncertainty over false confidence — say what was measured versus what was reasoned. No flattery. Reference material as markdown, never CSV; it goes into an Obsidian vault.

**Engineering values.** He is a machine-vision engineer who owns full pipelines, so treat him as a peer. He caught the hardcoded-pixel problem, correctly identified that the keyboard should overlay rather than resize, and chose the typing-mode approach over shrinking or scrolling when given the numbers. **When something involves a genuine tradeoff, give him the measurements and let him pick** — he asked for exactly that once ("if it's hard, discuss the options with me") and it produced a better answer than either default.

**No hardcoded pixel values in UI code.** Stated firmly and generally, not just for this project. Parameterize so it scales to other display sizes.

**Workflow.** He is on an iPhone, and his screenshots of the live site are the primary bug reports — read them carefully, they usually contain the diagnosis. Deploy is now hands-off: push to `main` and GitHub Actions builds, tests, and ships to Pages, so the old "one file per iteration, uploaded by hand" constraint no longer applies — but the discipline it forced (small, verifiable changes; the suite green before it ships) is worth keeping, because the suite is now literally the deploy gate.

**Own your mistakes plainly.** Several bugs in the list above were mine, including three layout fixes shipped without the ability to verify them, and a stretch of this very doc that had drifted from the code (the `position: fixed` claim in §6). Naming that directly — and then removing the ability to make the same class of mistake, by installing a real browser and gating on it — worked better than hedging.

---

## 10. Backlog

Ordered roughly by value over effort.

| | Item | Notes |
|---|---|---|
| B1 | **Save progress** | `window.storage` keyed on puzzle `id`. Refresh currently loses everything. Highest-value missing feature — the **headline of a future player-v2**. |
| B2 | Timer + solve time | The Mini's whole competitive loop. Pauses on blur. |
| B3 | Check word / check square | Needs a control surface — probably long-press or an overflow menu, not more buttons. |
| B4 | Reveal square / word / puzzle | Should mark revealed cells distinctly and disqualify a solve. |
| B5 | Dark mode | Tokens are declared but unexposed. Requires the §11.4 promotion rule: `accent` is illegal on dark except as a large mass on pure black; anything accent-carrying promotes to `accent-soft` `#6BC58C`. Needs implementing, not just documenting. |
| B6 | Construction-rule linting | Full checking, interlock (flood fill), 180° symmetry, duplicate entries. Warnings, not errors — the player should still render a non-conforming grid. |
| B7 | Rebus support | Changes `letters` from `string` to `string[]` and the check comparison with it. Do it before much else depends on the shape. |
| B8 | Compression for share links | See §4. Needed only past ~9×9. |
| B9 | Three.js renderer | Contract is in §3. Obvious first target: cell flip on entry completion, driven off the `letters` diff. |
| B10 | Desktop layout | Two-column with full across/down clue lists. Different enough to be a second view, not a media query. |
| B11 | Accessibility pass | Screen-reader grid semantics, focus management, announced clue changes. Only reduced-motion is currently respected. |
| B12 | `.puz` / `.jpz` import | Only if he ends up constructing in software that exports those. |

**Done in v1.1:** ~~Puzzle library / picker~~ — the 10 minis are bundled in `@crossword/clue-data` and reachable through the `Picker`. (It no longer depends on save-progress storage; that decoupling is what let it ship first.)

---

## 11. Known limitations

- No persistence. Refresh loses progress (B1).
- Numbering assumes standard row-major convention. Circular, barred, and diagonal grids would need a different geometry layer, not a patch.
- US QWERTY only, letters plus delete. No accented characters.
- Landscape phone with a keyboard up is a genuinely bad case — the board drops to ~38% size. Visible, but small.
- The PWA precaches its assets (~188 KB) on first visit and runs fully offline after. Fine over HTTPS, but keep an eye on the bundle if the engine grows a lot.
- **Deploy is GitHub Actions → Pages** (`.github/workflows/deploy.yml`), gated on the full Playwright suite; the site serves at `https://mmaggitti.github.io/crossword-v1/`. Pages is configured to deploy from Actions (Settings → Pages → Source: GitHub Actions), not from a branch. If a deploy fails, read the Actions log for the first error — a red run is usually a genuinely failing suite now, since the tests gate. This deploys **into** the `crossword-v1` repo, overwriting the retired single-file v1; pre-v1.1 share links keep resolving because v1.1 decodes the identical `#p=` share format, not because a separate copy is kept frozen.

---

## 12. ClueBattle — the next app in this monorepo

ClueBattle is a planned **second app** in the same repo (`apps/clue-battle`, not yet scaffolded): a two-player, mobile, crossword-clue guessing game that will reuse `@crossword/core` (parser, tokens, share codec) and `@crossword/clue-data` (the clue bank). It is at the **design stage** only — the working notes and the design essay live in `_collateral/two-player-clue-game/` (`HANDOVER (Clue Battle).md` and the "Making a Mobile Crossword-Clue Battle" write-up). Nothing about it ships yet; it's noted here so the monorepo layout (`apps/*` + a shared `@crossword/core`) reads as deliberate rather than premature.
