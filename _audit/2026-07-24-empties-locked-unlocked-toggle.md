# Cyclic "Locked Empties" + an Empties toggle across all modes — Plan

## Context

Today's **Cyclic** mode rotates a whole row/column, so the black-square **blocks travel**
with the line and the grid *shape* shifts as you drag. Mark wants an "updated" Cyclic where
the empty (block) cells stay **pinned to their true crossword positions** and only the
**letter tiles** cycle — so the board always reads as the real puzzle.

Rather than a 4th mode, Mark reframed this as an **orthogonal setting** — a new bottom row
**"Empties: Locked | Unlocked"** (styled like the Clues row) — applied to **all three
mechanics** (Swap, Slide, Cyclic), and explicitly asked whether this is a chance to
**refactor toward a cleaner, more modular move-system**. It is, and that's the backbone:

> **"Locked vs Unlocked" collapses to one idea: _which cells are movable._**
> **Unlocked** → blocks are ordinary movable tokens (what today's Cyclic already does with
> `null` cells). **Locked** → blocks are fixed walls; only letters move. Each mechanic is
> written **once** over "the movable cells," and the same code yields both behaviors. The
> `scramble` walk and the hint **solver compose these primitives, so all six combinations
> (3 mechanics × 2 empties modes) work for free** once the core is movable-cell-aware.

**Confirmed decisions:** all three modes get the toggle; **default Locked** everywhere
(this is the "replace Cyclic" — Cyclic's default flips to letters-cycle; Swap/Slide are
unchanged by default since they were already locked). Cyclic Locked uses **continuous-flow**
drag (letters follow the finger, flowing around pinned blocks, wrapping at the ends), with a
**flick-and-settle** fallback behind a flag. Outcome: a small, modular, movable-cell-aware
core that makes this feature — and future ones — a smaller lift.

## Goal

Add an orthogonal **Empties: Locked | Unlocked** setting (default Locked) across Swap, Slide,
and Cyclic, on top of a modular movable-cell-aware move-system; Cyclic Locked is the new
default and uses a continuous-flow carousel that cycles only the letters while blocks stay
pinned.

## Tech stack / global constraints (unchanged from the app)

- React 18 + Vite; pure move-system in `apps/scramble/src/mechanics.js`; hint search in
  `solver.js`; `@use-gesture/react` + `@react-spring/web` for the cyclic drag.
- **Solvable by construction:** `scramble` only walks legal moves from solved. All suites
  `process.exit(1)` on failure — CI gates deploy on `npm test`.
- No hardcoded pixels in *layout* (container-query units); the cyclic drag may measure the
  grid rect (the one allowed measurement, confined to the hook).
- Match existing patterns; `.cjs` tests via `_serve.cjs`; deliberate git staging; commit per
  task. **emptiesMode is session-only React state** (like `mechanic`/`size`/`clueMode`) — the
  `#p=` share codec (`packages/core/src/share.js`) encodes only the puzzle, so **no migration.**

## Architecture — the movable-cell core

**One source of truth** (new, top of `mechanics.js`):
```js
// Locked pins blocks (walls); unlocked pins nothing (blocks are movable null-tokens).
export function isFixed(solution, emptiesMode, r, c) {
  return emptiesMode !== "unlocked" && solution[r][c] === null;
}
export function movableCellsOf(solution, emptiesMode) { /* all [r,c] where !isFixed */ }
function movableAlong(solution, emptiesMode, axis, index) { /* movable indices in a line */ }
// slot k <- value from slot (k-dir), over the movable ring only; <2 movable => no-op.
function rotateMovable(line, mov, dir) { /* rotates values at `mov` positions; fixed untouched */ }
```

**Light registry** — only the mechanic-specific surface; keep `applyMove`/`inverseMove`/
`isSolved` as **shared, `move.type`-dispatched** verbs (the solver's BFS depends on that):
```js
const MECH = {
  swap:   { steps: 40, legal: swapMoves,   setup: null },
  slide:  { steps: 60, legal: slideMoves,  setup: slideSetup },
  cyclic: { steps: 12, legal: cyclicMoves, setup: null },
};
// legalMoves(state, solution) -> MECH[state.mechanic].legal(state, solution, state.emptiesMode ?? "locked")
```
Adding a future mechanic = one `MECH` entry + one generator (+ any new `move.type`), no rewrite.

**The linchpin:** give `applyMove` a third arg — `applyMove(state, move, solution)` — so its
shift branch can read the movable set from the same `isFixed`, symmetric with
`legalMoves`/`isSolved`. (Single source of truth. The churn is mechanical; every call site is
listed in Tasks 1–2. Fallback if churn bites: derive the ring from `state.board` nulls under
Locked — provably equal by invariant — but that splits "movable" into two derivations.)

---

## Task 1 — Move-system refactor: movable-cell core + `emptiesMode`

**Files:** `apps/scramble/src/mechanics.js`, `apps/scramble/src/solver.js`; tests in Task 5.

- Add `isFixed` / `movableCellsOf` / `movableAlong` / `rotateMovable` (above) and the `MECH`
  registry; `DEFAULT_STEPS`/`MECHANICS` derive from it.
- `createState(solution, mechanic, rnd = Math.random, emptiesMode = "locked")` — **appended**
  arg so existing calls default to Locked; store `state.emptiesMode`; `MECH[mechanic].setup?.()`.
  Slide `gapHome` stays a **letter** cell in both modes (tray is always a letter; the gap may
  *wander* onto blocks under Unlocked during play).
- Generators over the movable set:
  - `swapMoves` → all pairs of `movableCellsOf` (was `openCellsOf`).
  - `cyclicMoves` → row/col shifts only where `movableAlong(...).length >= 2` (prune no-op rings).
  - `slideMoves` → gap's orthogonal neighbors that are **not** `isFixed` (Locked: block = wall;
    Unlocked: block neighbors slide in), plus `place` when the gap is home.
- `applyMove(state, move, solution)` — **only the `shift` branch changes** (use `movableAlong`
  + `rotateMovable`; whole-line rotate falls out when nothing is fixed). Swap/slide/place/unplace
  untouched (a `null` block token swaps/slides like any value).
- `inverseMove` — **no change** (shift self-inverts: `movableAlong` is constant across a pair).
- `isSolved` — **no change** (already compares every cell incl. blocks + the tray guard; correct
  for all six combos — under Locked the block comparison is a harmless no-op).
- `scramble`/`scrambleUnsolved` — append `emptiesMode = "locked"`, pass `solution` to `applyMove`.
- `solver.js` — BFS `applyMove(st, mv, solution)`; **`solveSwap` must iterate `movableCellsOf`**
  (not `openCellsOf`) treating `null` as a value to match, else Unlocked-swap hints leave blocks
  displaced. `keyOf`/`humanizeMove` unchanged.
- Verify: `node apps/scramble/test/mechanics-test.cjs && node apps/scramble/test/solver-test.cjs`
  green (with Task 5 test updates). Commit.

## Task 2 — Unlocked Swap + Unlocked Slide (behavior + block interactivity)

**Files:** `apps/scramble/src/Game.jsx`, `apps/scramble/src/Board.jsx`.

- Every `applyMove(...)` in `Game.jsx` gains `model.solution` — `onShift`, `onCell` (swap + slide),
  `onTray`.
- `onCell` logic barely changes (swap already swaps any two selected cells; slide already gates on
  `legalMoves`). The real change is in `Board.jsx`: **block cells become interactive under Unlocked,
  non-cyclic** — route the `state.board[r][c] === null` branch through the clickable path so a block
  can be selected (`.sel`) or slid (`.mov`)/hinted, driven by the existing `movable` memo & hint set:
  ```jsx
  const interactive = state.emptiesMode === "unlocked" && state.mechanic !== "cyclic";
  // add data-r/data-c, sel/mov/hint classes and onClick only when interactive
  ```
- Verify: pane — Unlocked swap lets you select a block and swap it; Unlocked slide lets a block slide.
  Commit.

## Task 3 — Continuous-flow Locked-Cyclic rendering *(designed; strict generalization of the rigid strip)*

**Files:** `apps/scramble/src/Board.jsx`, `apps/scramble/src/useCyclicDrag.js`.

The rigid 3-copy strip **stays for Unlocked**. For Locked, a **per-tile ring carousel** inside the
same `.xws-clip` (degenerates to the uniform strip when a line has no blocks — `k === n`):
- **Ring:** `slots = non-block physical indices of the line, ascending`; `k = slots.length`,
  `n = line length`. `+1` slot-step: letter at `slots[j]` → `slots[(j+1) mod k]`.
- **Phase:** `p = offset / pitch` (pitch = one cell along the axis) ⇒ **one finger-cell = one
  slot-step** regardless of gap width (keeps the snap math identical).
- **Per-tile position** (drives each letter's `%` transform off the shared `offset` spring),
  bounded to `[0, 2n)` for any p:
  ```js
  function physCoord(j, p) {
    const q = j + p, fl = Math.floor(q), f = q - fl;
    const a = ((fl % k) + k) % k, b = (a + 1) % k;
    let gap = slots[b] - slots[a]; if (gap <= 0) gap += n;   // wrap off the end
    return slots[a] + f * gap;
  }
  // row transform: translateX(${(physCoord(j, o/pitch) - slots[j]) * 100}%)
  ```
- **Wrap = 2 copies per letter:** primary at `physCoord`, ghost at `physCoord − n`; exactly one
  lies in the visible `[0,n)` window and they hand off continuously. Existing `overflow:hidden`
  clip needs no change.
- **Layering (letters pass BEHIND blocks):** three layers in DOM order inside the clip — (A) fixed
  empty-tile backdrop at each `slots[j]`; (B) moving letters (2 copies, reusing `.xws-cell.tile`/
  `.home`); (C) the line's block cells redrawn opaque `.xws-cell.blk` on top.
- **Hook change is tiny:** `useCyclicDrag` still owns physics; surface pitch via
  `setActive({ axis, index, pitch })` so the Board converts `offset`→`p`. Snap
  (`steps = round(offset/pitch)`), `onRest → onShift(axis,index,steps)`, and the **anti-snap-back-
  flash handoff are unchanged** (offset reset only at drag start). At integer p every letter sits
  exactly on `slots[(j+p) mod k]` = the committed board, so the overlay unmounts onto a match.
- **Board branch:** `const locked = cyclic && state.emptiesMode === "locked";` → Locked builds the
  3-layer overlay; else the existing rigid strip **verbatim**. Base-cell loop + hint outline shared.
- **Fallback + reduced motion (behind a flag):** *flick-and-settle* — no mid-drag letter flow (a
  clamped rubber-band nudge only); on release, per-tile spring each letter `slots[j]→slots[(j+steps)
  mod k]` (same 2-copy wrap during the settle, same commit). Flip the flag if flow looks janky.
- **Main jank risk:** a letter crossing a wide block-gap outruns the finger (`gap` cells per
  finger-cell) — mild for sparse blocks; the flag is the hedge.
- Verify: pane asserts `onShift` fires with correct steps + at-rest overlay matches the grid; the
  *feel* is Simulator-only (Task 6). Commit.

## Task 4 — "Empties: Locked | Unlocked" settings row + re-scramble

**Files:** `apps/scramble/src/Game.jsx`, `apps/scramble/src/Board.jsx` (CSS).

- `const [emptiesMode, setEmptiesMode] = useState("locked");` and a dock row parallel to the Clues
  row (`EMPTIES = [{id:"locked",…},{id:"unlocked",…}]`). Optionally disable it on puzzles with no
  blocks (Locked ≡ Unlocked there).
- **Re-scramble on toggle:** include `emptiesMode` in the during-render key — `const wantKey =
  \`${active.id}:${mechanic}:${emptiesMode}\`` — and pass it to both scramble sites
  (`scrambleUnsolved(model.solution, mechanic, undefined, undefined, emptiesMode)`), so a board
  scrambled under one movable-set is never shown under the other.
- **This task flips Cyclic's default to Locked** (the "replace Cyclic"). It must land **together
  with Task 3** (see Sequencing) so the drag matches the commit on block-bearing lines.
- Verify: pane — the row toggles, move counter resets, board re-scrambles. Commit.

## Task 5 — Tests + solver coverage

**Files:** `test/mechanics-test.cjs`, `test/solver-test.cjs`, `test/ui-test.cjs`.

- Restructure the mechanics seed loop into `mechanic × ["locked","unlocked"]` (6 combos), passing
  `emptiesMode` and `applyMove(s, move, solution)`. Keep "all seeds solvable via recorded path" for
  **all six**. Assert: Locked swap/slide/cyclic → **blocks never move**; Unlocked cyclic → **blocks
  travel**; Unlocked slide/swap → a block **may** move. Add a **block-bearing** cyclic-shift test
  (e.g. row `..CAP`: Locked cycles C/A/P and keeps cols 0–1 `null`; Unlocked moves a `null` in). New
  `rotateMovable` unit (fixed untouched, `<2` no-op).
- `solver-test.cjs`: thread `solution` into `applies`/`bruteMin`/`solvableWithin`; split the cyclic
  case into explicit Locked (pinned) + Unlocked (travel); **add the high-value `swap Unlocked (with
  blocks)` test** (fails if `solveSwap` still uses `openCellsOf`); add shallow slide-Unlocked +
  cyclic-Locked validity/optimality.
- `ui-test.cjs`: Empties toggle re-scrambles (counter resets); Unlocked-swap block is clickable and
  gains `.sel`; existing cyclic drag/hint assertions still pass.
- Verify: `npm test` green. Commit.

## Task 6 — Verify on device + deploy

- `npm test` at repo root — **all suites green** (gates deploy).
- **iOS Simulator (the only truthful surface for the carousel):** open `#mini-001`, Cyclic + Locked
  — drag a row and a column; confirm **blocks never move** while letters **flow around them and wrap**,
  it snaps, and solving is detected. Flip Empties → Unlocked → old blocks-travel carousel returns.
  Check Swap/Slide under Unlocked (select/slide a block). Screenshot each; if flow looks janky, flip
  the flick-and-settle flag and re-check.
- **Commit + push once the feature is coherent** (Tasks 1–5 in), watch Actions, confirm
  `/crossword-v1/scramble/` live; player root + `/dev/` unaffected.

## Sequencing / risks

- **Deploy coherence:** Task 4 flips the global default to **Locked**, which turns Cyclic into
  letters-cycle. Do **not** push a state where that default is on but Task 3's rendering isn't —
  land Tasks 1→3→4 (then 2, 5) locally and **push once** in Task 6 so the first deploy is coherent.
- **`applyMove` signature change must be complete** — every call site (Tasks 1–2, and the tests)
  gets `solution` or shifts silently misbehave. This is the main mechanical risk.
- **`solveSwap` → `movableCellsOf` is mandatory** for correct Unlocked-swap hints.
- **BFS budget:** Unlocked state spaces are larger (deep scrambles hit `exhausted` sooner — existing
  contract); Locked-cyclic is *smaller* than today, a net win.
- **Scope honesty:** this is a large, multi-file feature (5 source files + 3 test files). It is
  broken into independently-testable tasks; the interlock is Task 1 (model) ⇄ Task 3 (rendering) ⇄
  Task 4 (default flip).

## Critical files
- `apps/scramble/src/mechanics.js` — movable-cell core, registry, `applyMove(+solution)`.
- `apps/scramble/src/solver.js` — `applyMove(+solution)`, `solveSwap` over movable cells.
- `apps/scramble/src/Board.jsx` — Locked per-tile carousel; Unlocked block interactivity.
- `apps/scramble/src/useCyclicDrag.js` — surface `pitch`; physics unchanged.
- `apps/scramble/src/Game.jsx` — `emptiesMode` state + row, re-scramble key, `applyMove(+solution)`.
- Tests: `test/{mechanics,solver,ui}-test.cjs`. Deploy workflow unchanged.
