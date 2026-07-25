# Purple crossword player at `/crossword-v1/purple/`

## Context

Mark wants a purple-color-scheme version of the standard crossword player, deployed
alongside the existing green one at `https://mmaggitti.github.io/crossword-v1/purple/`.
The canonical purple hexes come from the §11.4 palette doc Mark attached (which
satisfies `docs/color-spec-11.md:3` — "ask before making a substantive palette change").

Two facts make this smaller than it looks:

1. **`apps/player/src/` is 100% token-driven** — zero color literals in all three files.
   Every color resolves through `var(--…)` from the `TOKENS` string in
   `packages/core/src/CrosswordPlayer.jsx`.
2. **The purple neutrals are byte-identical to the green ones.** `ink`, `muted`,
   `border`, `surface`, `surface-subtle`, `canvas` are the same hexes in both columns.
   **Only the accent ramp moves.** So `theme_color`, the `<meta name="theme-color">`,
   the `<body>` background, and `paint-test.cjs` (asserts `rgb(251,249,244)`) all stay
   correct untouched.

**Two contrast failures, not one.** Verified by computing WCAG ratios directly — the
vivid `#A100FF` fails AA against the pale tint in *both* directions:

| Pairing | Where | Green | Purple | Gate |
|---|---|---|---|---|
| `accent` text on `accent-softest` | clue pill, `:328` | 5.07 | **4.05** ❌ | 4.5 |
| `accent-softest` on `accent` | cell number under cursor, `:245` | 5.07 | **4.05** ❌ | 4.5 |
| `accent-deep` on `accent-softest` | *the fix for #1* | 7.67 | **6.37** ✅ | 4.5 |
| white on `accent` | *the fix for #2*; also buttons, cursor, SOLVED | 6.61 | **5.30** ✅ | 4.5 |
| black on `soft` / `softest` | tints | 9.99 / 16.09 | 9.98 / 16.05 ✅ | 7.0 |
| `accent-deepest` on `softest` | banner, update | 10.67 | 10.64 ✅ | 4.5 |
| `accent-deep` on white / canvas | header buttons, arrows | 10.01 / 9.52 | 8.34 / 7.93 ✅ | 4.5 |
| `accent` on canvas | solved mark, solved border (graphic) | 6.29 | 5.04 ✅ | 3.0 |

The cell number under the cursor is ~17px — normal text, so 4.5:1 applies. It can't be
fixed by the same role as the clue pill, because there the tint is the *background*.

**Decisions taken (confirmed with Mark):** same app built twice (not a forked app
folder); clue-pill text uses `accent-deep`. `HANDOVER.md:149` already anticipates the
latter — *"accent-deep on the same fill would clear 7:1 if more headroom is ever
wanted"* — so this is pre-approved reasoning, not a new judgment call.

**Goal:** purple live at `/crossword-v1/purple/`, green untouched at the root,
scramble untouched, deploy still gated by `npm test`.

---

## Architecture

Theme is applied by an **ancestor class** — no component API change:

- `TOKENS` gains a `.theme-purple .xw { … }` block. Specificity `(0,2,0)` beats the base
  `.xw` `(0,1,0)` unconditionally, which matters because `<style>{TOKENS}</style>` is
  rendered *inside* the `.xw` div (`CrosswordPlayer.jsx:1073`, `Picker.jsx:86`).
- `main.jsx` adds the class to `<html>`, so both the player and the picker theme for
  free, and **`apps/scramble` is untouched** (it shares `TOKENS` but never gets the class).

Verified safe: colour is declared in exactly one place (`.xw`); `.xw-gridwrap` declares
only dimensions; the two `!important`s are both `transition`/`animation` inside a
reduced-motion block; `Picker.jsx` consumes tokens but declares none.

---

## Task 1 — Core: purple palette + two new roles

**File:** `packages/core/src/CrosswordPlayer.jsx` (`TOKENS`, lines 22–456)

- [ ] Add both roles to the base `.xw` palette block (after `--accent-softest`, ~line 74).
  Both are `var()` aliases of existing tokens, so **green renders byte-identically**:
```css
  /* Accent as TEXT on a tint, and the quiet text on an accent FILL. A ramp
     whose accent fails AA in either pairing (see purple) re-points these. */
  --accent-ink:      var(--accent);
  --on-accent-quiet: var(--accent-softest);
```
- [ ] Repoint the two failing rules — and **only** these two; leave every other
  `var(--accent)` alone:
  - `.xw-cluetext` (~line 328): `color: var(--accent)` → `var(--accent-ink)`
  - `.xw-cell.cursor .xw-num` (~line 245): `color: var(--accent-softest)` → `var(--on-accent-quiet)`
- [ ] Append the purple block **after the `.xw.typing` rules** (~line 448). `.xw.typing`
  is also `(0,2,0)`, so placing the theme last makes any future collision resolve in the
  theme's favour (today they're disjoint — typing only touches layout):
```css
/* ===== §11.4 palette, purple instantiation ==========================
   Same roles, different hue. Neutrals are identical to the green column,
   so only the accent ramp moves. Applied by main.jsx on the purple build;
   the ancestor class gives (0,2,0) so it wins over .xw regardless of order. */
.theme-purple .xw {
  --accent:        #A100FF;
  --accent-deep:   #7500C0;
  --accent-deepest:#460073;
  --accent-soft:   #C2A3FF;
  --accent-softest:#E6DCFF;
  /* #A100FF vs #E6DCFF is 4.05:1 — under AA in BOTH directions. The spec's
     own escape hatch: text on accent-deep (6.37:1), quiet text on an accent
     fill goes white (5.30:1). Vivid P still drives fills + graphic emphasis. */
  --accent-ink:      var(--accent-deep);
  --on-accent-quiet: var(--surface);
  --status-ok:       #A9DCB9;   /* defined per spec; renders nothing (unused) */
}
```
- [ ] **Verify:** `npm test --workspace player` (9 suites) and `--workspace scramble`
  both green, unchanged. Commit.

---

## Task 2 — Player: apply the theme

**Files:** `apps/player/src/main.jsx`; `apps/player/package.json`; `apps/player/vite.config.js`

Derive the theme from `BASE_URL` as the primary signal — it's set from `base`, so it
**cannot drift from the deploy path** and is self-verifying in CI. `VITE_THEME` stays as
a local-dev override. (Confirmed: Vite 5.4's default `envPrefix: "VITE_"` picks shell
`VITE_*` vars up with no `define` and no `.env` file.)

- [ ] `main.jsx` — above `createRoot`, so the class is set before first paint:
```js
// One codebase, two themed builds. BASE_URL is derived from the deploy path,
// so the purple build self-identifies; VITE_THEME is the local-dev override.
if (import.meta.env.BASE_URL.includes("/purple/") || import.meta.env.VITE_THEME === "purple") {
  document.documentElement.classList.add("theme-purple");
}
```
- [ ] `apps/player/package.json` — add two scripts. **`--outDir dist/purple` is
  load-bearing** (see Task 3), and a named script avoids the flaky
  `npm run … --workspace … -- --flag` arg-forwarding path:
```json
    "dev:purple": "VITE_THEME=purple vite",
    "build:purple": "vite build --outDir dist/purple",
```
- [ ] `vite.config.js` — skip the PWA plugin for the purple build (the player's SW
  already scopes all of `/crossword-v1/`; a second nested worker is unnecessary here):
```js
  const isPurple = (process.env.BASE_PATH ?? "").includes("/purple/");
  // …plugins: [react(), ...(isPurple ? [] : [VitePWA({ /* unchanged */ })])]
```
- [ ] `vite.config.js` — let the existing SW cache the new sibling's assets. Extend the
  second `runtimeCaching` regex (~line 82):
  `/^\/crossword-v1\/(scramble|dev)\//` → `/^\/crossword-v1\/(scramble|dev|purple)\//`
- [ ] **Verify:** `npm run dev --workspace player` still green;
  `npm run dev:purple --workspace player` renders purple. Commit.

---

## Task 3 — Deploy to `/crossword-v1/purple/`

**File:** `.github/workflows/deploy.yml`

**The build-order hazard is the opposite of what it looks like.** Vite's `emptyOutDir`
defaults to true for any `outDir` inside the project root, so *any* `vite build` in the
player workspace wipes `apps/player/dist` wholesale. Building purple into `dist/purple`
(nested) means Vite empties only `dist/purple` — so **no assemble step, no `mv`, no
`cp`, and no `.gitignore` change** (the existing `dist/` rule already covers it).

- [ ] Insert **after** the scramble build, **before** "Assemble site":
```yaml
      - name: Build purple variant for Pages
        run: npm run build:purple --workspace player
        env:
          BASE_PATH: /crossword-v1/purple/
```
  Ordering is load-bearing twice over: purple must run **after** the green build (or it's
  wiped), and after it so purple's assets are *not* swept into green's precache manifest
  (`workbox.globPatterns` globs all of `dist` at green-build time).
- [ ] Add a one-line guard so a mis-plumbed theme can't ship silently green:
```yaml
      - name: Verify purple actually themed
        run: grep -rq "theme-purple" apps/player/dist/purple/assets/ || (echo "purple build is not themed" && exit 1)
```
- [ ] **Document the local footgun** in the app README: `npm test` runs
  `pretest: vite build`, which wipes `dist/purple`. Re-run `build:purple` after testing
  if you want to eyeball purple locally.
- [ ] **Verify:** push; watch Actions; confirm all four URLs 200 —
  `/crossword-v1/` (green), `/purple/`, `/scramble/`, `/dev/` — and grep the purple
  bundle for `A100FF`.

---

## Task 4 — Make the colour tests real, then cover purple

**Files:** `apps/player/test/clue-test.cjs`; create `apps/player/test/theme-test.cjs`;
`apps/player/package.json`

`clue-test.cjs:64` asserts `contrast("#076B3B", "#CDE8D4") >= 4.5` — **two string
literals, evaluated in Node, never touching the DOM.** It reads the computed styles at
lines 25–32 and then only `console.log`s them. It cannot detect a palette regression in
either theme. Fix that before adding to it.

- [ ] **Retrofit `clue-test.cjs`** to assert *used* values (which every engine normalises
  to `rgb(r, g, b)`), feeding the parsed triples into the existing `contrast()` helper.
  This turns a tautology into a real gate and tests specificity + `var()` chaining at once.
- [ ] **Create `theme-test.cjs`** — the theme is pure CSS, so no second build is needed:
  load the normal `dist/`, add `.theme-purple` to `documentElement`, then assert **used
  values**, never raw custom-property strings (those round-trip whitespace differently
  across engines):
  - `.xw-cluetext` colour is `rgb(117, 0, 192)` (`accent-deep`) — the regression guard
    for contrast fix #1
  - `.xw-cell.cursor .xw-num` colour is `rgb(255, 255, 255)` — guard for fix #2
  - `.xw-cell.cursor` background is `rgb(161, 0, 255)`
  - contrast gates recomputed from those live values: ≥ 4.5 on both fixed pairs
  - **neutrals unchanged** by the theme (`--canvas` still resolves to `#FBF9F4`) — this
    is what keeps `paint-test.cjs` and the manifest honest
- [ ] Add `theme` to the test loop (`apps/player/package.json:12`), making it 10 suites.
- [ ] **Verify:** `npm test` at the repo root passes end to end. Commit.

---

## Task 5 — Local preview + docs

- [ ] `.claude/launch.json` (vault root) — add on port **5201** (5199 player, 5200 scramble):
```json
    {
      "name": "crossword-purple",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["--prefix", "10 output/crossword-game/apps/player", "run", "dev:purple", "--", "--port", "5201", "--strictPort"],
      "port": 5201
    }
```
- [ ] **Suite count:** "9 suites"/"nine suites" is asserted in ~7 places — `README.md`,
  `HANDOVER.md` (×3), `.github/workflows/deploy.yml`, `apps/player/README.md`,
  `apps/player/test/README.md` (×2, incl. the suite table). Update to 10.
- [ ] **`docs/color-spec-11.md`** — add a purple column to the ramp table and to the
  contrast gates (which currently state 6.61/9.99/16.09 as bare facts). Note that the
  recorded reason `--status-ok` is unused (a ~15.6° hue collision with a *green* accent)
  does not hold for purple (~120° away) — record the observation but **don't act on it**;
  divergent behaviour between two builds off one stylesheet is worse than a stale note.
- [ ] **`HANDOVER.md`** — Live-at URLs, repo tree, suite table, revision-history entry,
  deploy bullet; add purple rows to the §5 contrast table; and record `--accent-ink` /
  `--on-accent-quiet` as a new entry in the "judgment calls already made" table, since
  the spec's role set is otherwise closed.
- [ ] **`_audit/`** — per the vault standing instruction, save the approved plan
  read-only as `_audit/2026-07-24-purple-theme-variant.md` (chmod 444), matching the
  existing house format.

---

## Verification

1. **Gate:** `npm test` at `10 output/crossword-game` — 10 player suites + 3 scramble.
2. **Browser pane:** `preview_start {name:"crossword-purple"}`; `read_console_messages
   {onlyErrors:true}` clean; `javascript_tool` → `getComputedStyle(document.querySelector(".xw-cluetext")).color`
   is `rgb(117, 0, 192)`. Confirm the green player on 5199 is **still green** in the same session.
3. **iOS Simulator (the truth test):** `attach` first, then `open_url
   http://localhost:5201/#mini-001`. Screenshot the picker and a puzzle; confirm the clue
   pill, typing cursor, cell numbers under the cursor, header buttons and SOLVED stamp all
   read purple and legible. Solve one mini to see the stamp.
4. **Live:** load `/crossword-v1/purple/` on the Simulator; confirm `/crossword-v1/` is
   untouched and an installed green PWA still updates normally (the SW regex is the thing
   to watch).

## Critical files

- `packages/core/src/CrosswordPlayer.jsx` — `TOKENS`: two roles (~74), `.xw-cluetext`
  (~328), `.xw-cell.cursor .xw-num` (~245), purple block (after ~448). **Shared with
  scramble — the ancestor class is what keeps scramble green.**
- `apps/player/src/main.jsx` · `apps/player/package.json` (2 scripts + test loop) ·
  `apps/player/vite.config.js` (conditional PWA, SW regex ~82)
- `.github/workflows/deploy.yml` — purple build + themed-output guard
- `apps/player/test/clue-test.cjs` (de-tautologise) · `test/theme-test.cjs` (new)

## Out of scope — flag, don't do

- **Purple is a browser page, not an installable PWA.** No PWA plugin ⇒ no manifest and
  no `registerSW`, so it can't be added to the home screen as its own app, and it's
  offline-capable only for users who visited green first (green's SW scope covers it).
  Nothing regresses — purple is a brand-new URL — but if Mark wants it installable, the
  cheap follow-up is a hand-written `purple.webmanifest` + a `transformIndexHtml` link
  (plus a distinct `<title>`/`apple-mobile-web-app-title`, which are currently identical
  to green and would produce two indistinguishable home-screen icons).
- Purple PWA icons (the five PNGs in `public/` are green artwork; shows only as a green
  favicon on the purple page), theming scramble, or a runtime theme switcher.
