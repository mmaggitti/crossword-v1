# Cyclic mode — row/column carousels — Implementation Plan

> **For agentic workers:** implement task-by-task; each task ends green and committed.

**Goal:** Add the third scramble mechanic — **Cyclic** — where the solved board is scrambled by
cyclically shifting whole rows and columns (blocks travel with them), and the player drags a row or
column like a slidable carousel to restore it.

**Architecture:** Cyclic is one more move-generator in the existing pure `mechanics.js` — a move is
`{type:"shift", axis:"row"|"col", index, dir:±1}`. `isSolved` stops skipping blocks (a displaced
block now counts as unsolved); the renderer decides "block" from the *board* cell, not the solution
cell — both changes are safe for Swap/Slide because blocks never move there. The grab-and-drag
interaction uses **`@use-gesture/react`** (axis-locked drag → which line + offset + velocity) and
**`@react-spring/web`** (animate the offset, spring-snap to the nearest step). Seamless wrap during
the drag is a 3-copy overlay strip (no library does this).

**Tech Stack:** React 18, Vite, `@crossword/core` (`parsePuzzle`, `TOKENS`), the existing
`mechanics.js` move system, `@use-gesture/react` + `@react-spring/web` (new, scramble app only).

## Global Constraints (from the existing app)
- No hardcoded pixels in *layout*; cell size stays CSS/container-query driven. The cyclic drag may
  measure the grid rect for gesture math (px→step) — that's interaction math, not layout, and is the
  one allowed measurement, confined to the drag hook.
- Every mechanic stays solvable **by construction**: `scramble` only walks legal moves from solved.
- All suites `process.exit(1)` on failure — CI gates the deploy on `npm test`.
- Match existing patterns: pure `mechanics.js`, `SCRAMBLE_CSS`/`TOKENS` styling, `.cjs` tests via
  `_serve.cjs`.

---

## Why a library (the determination Mark asked for)
- The mechanic = a **draggable carousel with axis-locked gesture + inertia snap-to-grid**.
- `@use-gesture/react` `useDrag` gives `movement`, `velocity`, and locks to the dominant axis — it
  directly solves "is this a row drag or a column drag, and by how much." Hand-rolling robust
  pointer + axis + velocity capture is the fiddly part it removes.
- `@react-spring/web` `useSpring`/`api.start` springs the offset to the snapped step and carries
  `velocity` for a momentum fling — the tactile feel Mark wants.
- Rejected: motion-framer (one dep, but element-based `drag` fits "pick a line by axis" poorly);
  pure hand-roll (possible, but loses momentum polish and re-implements the gesture math).

---

## Task 0 — Land the in-flight 3×3 toggle (unblocks the broken tree)

`apps/scramble/src/Game.jsx` currently imports `{ useMemo, useState }` but still calls `useEffect`
in the scramble effect — the app won't run. Replace the effect with a during-render reset (which
Cyclic also needs, since switching mechanic must re-scramble without a frame where the board and
grid disagree), and guard the render.

**Files:** Modify `apps/scramble/src/Game.jsx`; Modify `apps/scramble/test/ui-test.cjs`.

- [ ] **Replace** the `useEffect(() => { setGame(...) }, [model, mechanic])` block with a keyed
  during-render reset:
```jsx
const [game, setGame] = useState(null);
const [scrambleKey, setScrambleKey] = useState("");
const [history, setHistory] = useState([]);
const [moves, setMoves] = useState(0);
const [sel, setSel] = useState(null);

// Re-scramble when the active puzzle or mechanic changes. Done during render (not
// an effect) so `game` is never a frame out of sync with the grid — e.g. toggling
// a 3x3 back to a 5x5 would otherwise index a 5-row model into a 3-row board.
const wantKey = `${active.id}:${mechanic}`;
if (scrambleKey !== wantKey) {
  setScrambleKey(wantKey);
  setGame(scrambleUnsolved(model.solution, mechanic).state);
  setHistory([]); setMoves(0); setSel(null);
}
```
- [ ] **Guard the render:** change `if (!game) return null;` to
  `if (!game || game.board.length !== model.rows) return null;`
- [ ] **Add the toggle UI test** to `ui-test.cjs`, right after the "board is not already solved"
  check (default size is 5×5, so the later 5×5 checks still hold once it toggles back):
```js
// --- 3x3 size toggle ---
ok("size caption reads 5x5 by default", /5\D5/.test((await page.locator(".xws-size").textContent()).trim()));
await page.locator(".xws-size").click(); await page.waitForTimeout(80);
ok("tapping the caption switches to 3x3", /3\D3/.test((await page.locator(".xws-size").textContent()).trim()));
ok("3x3 renders 9 cells", (await page.locator(".xws-cell").count()) === 9);
ok("toggle has no button chrome", await page.locator(".xws-size").evaluate((el) => getComputedStyle(el).borderTopWidth === "0px"));
await page.locator(".xws-size").click(); await page.waitForTimeout(80);
ok("tapping again returns to 5x5", (await page.locator(".xws-cell").count()) === 25);
```
- [ ] **Verify + commit:** `npm test --workspace scramble` green (mechanics 13 + UI now ~26).
  `git add apps/scramble/src/Game.jsx apps/scramble/test/ui-test.cjs && git commit`.

---

## Task 1 — mechanics.js: the Cyclic move-generator

**Files:** Modify `apps/scramble/src/mechanics.js`; Modify `apps/scramble/test/mechanics-test.cjs`.

**Interfaces produced:** `legalMoves`/`applyMove`/`inverseMove`/`isSolved`/`scramble` gain a
`{type:"shift", axis:"row"|"col", index:number, dir:1|-1}` move; `MECHANICS` includes `"cyclic"`.
`createState` needs no change (cyclic uses the default: board = solution copy, no gap/tray).

- [ ] `MECHANICS = ["swap", "slide", "cyclic"]`; `DEFAULT_STEPS = { swap: 40, slide: 60, cyclic: 12 }`.
- [ ] `legalMoves`, cyclic branch (all row + column shifts, both directions):
```js
if (state.mechanic === "cyclic") {
  const out = [];
  const rows = solution.length, cols = solution[0].length;
  for (let r = 0; r < rows; r++) { out.push({type:"shift",axis:"row",index:r,dir:1}); out.push({type:"shift",axis:"row",index:r,dir:-1}); }
  for (let c = 0; c < cols; c++) { out.push({type:"shift",axis:"col",index:c,dir:1}); out.push({type:"shift",axis:"col",index:c,dir:-1}); }
  return out;
}
```
- [ ] `applyMove`, shift case (rotates the whole line incl. `null` blocks; `dir:+1` moves content to
  the next index, wrapping):
```js
} else if (move.type === "shift") {
  const b = next.board;
  if (move.axis === "row") {
    const row = b[move.index], n = row.length;
    b[move.index] = row.map((_, i) => row[((i - move.dir) % n + n) % n]);
  } else {
    const n = b.length;
    const col = b.map((row) => row[move.index]);
    for (let r = 0; r < n; r++) b[r][move.index] = col[((r - move.dir) % n + n) % n];
  }
}
```
- [ ] `inverseMove`: `if (move.type === "shift") return { type: "shift", axis: move.axis, index: move.index, dir: -move.dir };`
- [ ] **Unify `isSolved`** — delete the `if (solution[r][c] === null) continue;` line so *every* cell
  (blocks included) must match. Safe for swap/slide (blocks stay `null === null`); required for cyclic
  (blocks move). Keep the `if (state.tray != null) return false;` guard.
- [ ] **Generalize the scramble anti-backtrack** (the current `prevGap`/`m.from` logic is
  slide-only). Add `sameMove` and filter out the inverse of the last applied move:
```js
function sameMove(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === "swap") return sameCell(a.a, b.a) && sameCell(a.b, b.b);
  if (a.type === "slide") return sameCell(a.from, b.from);
  if (a.type === "shift") return a.axis === b.axis && a.index === b.index && a.dir === b.dir;
  return true;
}
// scramble loop: track lastInverse = inverseMove(move, state) each step and
//   let forward = moves.filter((m) => !sameMove(m, lastInverse));
//   if (forward.length) moves = forward;
// (equivalent to the old slide behaviour; also covers cyclic and swap.)
```
- [ ] **Extend `mechanics-test.cjs`:** add cyclic to a mechanic loop that already runs swap/slide, so
  the 40-seed solvability + block-integrity checks now include cyclic — but for cyclic the blocks
  DO move, so add a cyclic-specific assertion: after scramble the block *positions* differ from
  solution on at least some seeds, and the recorded `undoPath` restores every cell (letters AND
  blocks) exactly. Add a shift-legality check (a row shift changes only that row; a col shift only
  that column). Re-run swap/slide assertions unchanged.
- [ ] **Verify + commit:** `node apps/scramble/test/mechanics-test.cjs` green; `git commit`.

---

## Task 2 — Board.jsx: blocks render from board state; hide numbers in cyclic

**Files:** Modify `apps/scramble/src/Board.jsx`.

- [ ] Block detection uses the **board**, so travelled blocks render in their current spot:
```jsx
if (state.board[r][c] === null) { cells.push(<div key={key} className="xws-cell blk" />); continue; }
```
  (Was `solution[r][c] === null`. Identical for swap/slide where blocks never move.)
- [ ] Suppress cell numbers in cyclic (solution-position numbers are meaningless on a shuffled grid):
  `const number = state.mechanic === "cyclic" ? null : (cellIndex[r][c]?.number ?? null);`
- [ ] **Verify + commit:** `npm test --workspace scramble` still green (swap/slide unaffected); manual
  pane check that a cyclic board (once Task 4 enables it) shows blocks in scrambled positions.

---

## Task 3 — The grab-and-drag carousel (deps + hook + overlay + enable mode)

**Files:** Modify `apps/scramble/package.json` (add `@use-gesture/react`, `@react-spring/web`);
Create `apps/scramble/src/useCyclicDrag.js`; Modify `apps/scramble/src/Board.jsx` (render the active
drag strip); Modify `apps/scramble/src/Game.jsx` (enable Cyclic, wire the hook + `onShift`).

- [ ] **Add deps** to `apps/scramble/package.json` dependencies: `"@use-gesture/react": "^10.3.1"`,
  `"@react-spring/web": "^9.7.5"`; run `npm install` at the repo root.
- [ ] **`useCyclicDrag.js`** — capture a drag on the grid, drive a spring offset, snap on release, and
  emit whole-step shifts. Uses the grid rect (measured once per drag) for px→step. Confirm exact
  `useDrag` config against the react-spring-physics skill's `references/` during implementation.
```js
import { useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { useSpring } from "@react-spring/web";

// onShift(axis, index, steps): apply `steps` discrete shifts (steps<0 => dir -1).
export function useCyclicDrag({ gridRef, rows, cols, enabled, onShift }) {
  const [active, setActive] = useState(null);            // {axis:"row"|"col", index}
  const [{ offset }, api] = useSpring(() => ({ offset: 0 }), []);
  const pitch = useRef(1);

  const bind = useDrag(({ first, last, movement: [mx, my], velocity: [vx, vy], xy: [px, py], cancel }) => {
    if (!enabled) return;
    if (first) {
      const rect = gridRef.current.getBoundingClientRect();
      const axis = Math.abs(mx) >= Math.abs(my) ? "row" : "col";      // dominant axis
      const relX = px - rect.left, relY = py - rect.top;
      const index = axis === "row"
        ? Math.min(rows - 1, Math.max(0, Math.floor(relY / (rect.height / rows))))
        : Math.min(cols - 1, Math.max(0, Math.floor(relX / (rect.width / cols))));
      pitch.current = axis === "row" ? rect.width / cols : rect.height / rows;
      setActive({ axis, index });
    }
    const along = active?.axis === "col" ? my : mx;
    if (last) {
      const v = active?.axis === "col" ? vy : vx;
      const raw = along / pitch.current;
      const steps = Math.round(raw + Math.sign(raw) * Math.min(2, Math.abs(v) * 0.6));   // small momentum
      api.start({
        offset: steps * pitch.current,
        config: { tension: 320, friction: 32 },
        onRest: () => { onShift(active.axis, active.index, steps); api.set({ offset: 0 }); setActive(null); },
      });
    } else {
      api.set({ offset: along });
    }
  }, { filterTaps: true, pointer: { touch: true } });

  return { bind, active, offset };
}
```
- [ ] **Board** renders the active line as a **3-copy overlay strip** so the wrap is seamless while
  dragging. When `active` is set, the active row/column's tiles are drawn in an absolutely-positioned
  strip over that line, containing three consecutive copies (prev | current | next) laid out at the
  cell pitch and translated by the animated `offset` (an `animated.div` from `@react-spring/web`),
  clipped to the line's bounds. Non-active cells render as today; the static cells of the active line
  are hidden underneath. On snap-settle the strip unmounts and the board shows the committed shift.
  Pass `bind`, `active`, `offset` from Game into Board; apply `{...bind()}` to the grid container.
  (This overlay is the part to build carefully and verify on device — see Verification. Acceptable
  fallback if the overlay proves finicky: translate the active line without wrap copies and let the
  wrap appear only on the post-snap commit; keep this documented as the fallback, not the target.)
- [ ] **Game** — enable Cyclic and wire it:
  - `MODES` cyclic entry: `{ id: "cyclic", label: "Cyclic", note: "hard", hint: "drag a row or column" }`
    (remove `disabled` and the "soon"/blockless comment).
  - `const gridRef = useRef(null);` passed to Board.
  - `const onShift = (axis, index, steps) => { if (!steps) return; let g = game; const dir = steps > 0 ? 1 : -1; for (let k = 0; k < Math.abs(steps); k++) g = applyMove(g, { type: "shift", axis, index, dir }); commit(g); };`
    (one committed move per drag — Undo reverts the whole drag; adjust if per-step undo is wanted.)
  - `const cyclic = useCyclicDrag({ gridRef, rows: model.rows, cols: model.cols, enabled: game.mechanic === "cyclic" && !solved, onShift });`
  - The tap handler `onCell` already no-ops for cyclic (it branches on swap/slide only) — leave taps
    inert in cyclic so a tap doesn't shift.
- [ ] **Verify + commit:** `npm test --workspace scramble` green; pane + Simulator drag check
  (Task 5); `git commit`.

---

## Task 4 — Tests for cyclic in the UI suite

**Files:** Modify `apps/scramble/test/ui-test.cjs`.

- [ ] Switch to Cyclic (the button is now enabled) and assert the board renders (25 cells; blocks may
  sit anywhere), numbers are hidden, and the mode hint reads "drag a row or column".
- [ ] Because spring-drag is hard to drive reliably in headless Playwright, **prove the shift wiring
  via the exposed move path rather than a synthetic fling**: expose nothing new — instead assert a
  scripted solve by dispatching the same discrete shifts the drag would emit. Simplest reliable form:
  keep a tiny test-only affordance — a `data-testid="cyclic-shift"` hidden control is NOT added
  (avoid test-only DOM); instead the UI test drives cyclic by pointer events on the grid at row/column
  centers with a horizontal/vertical drag of ~1.5 cell widths and asserts the move counter increments
  and at least one cell changed. Mark the fling-momentum + seamless-wrap as **device-verified only**
  (like the iOS keyboard), with a comment saying so.
- [ ] **Verify + commit:** `npm test` (both apps) green.

---

## Task 5 — Verify on device + deploy

- [ ] `npm test` at repo root — **all suites green** (9 player + scramble mechanics incl. cyclic +
  scramble UI). CI gates on this.
- [ ] **Browser pane** (`crossword-scramble`, port 5200): Cyclic renders; a horizontal drag on a row
  shifts it and snaps; console clean.
- [ ] **iOS Simulator** (the only place touch + spring feel are real): open `#mini-001`, switch to
  Cyclic, drag a row and a column, confirm the wrap is visible mid-drag, it snaps, and solving is
  detected. Screenshot the win. Repeat on the 3×3 (toggle) — cyclic on 3×3 should feel very easy.
- [ ] **Commit + push**; watch the Actions deploy; confirm `/crossword-v1/scramble/` live and the
  player root + `/dev/` unaffected.

## Critical files
- `apps/scramble/src/mechanics.js` — cyclic move-gen, unified `isSolved`, generic scramble.
- `apps/scramble/src/Board.jsx` — block-by-board render, hidden numbers, active drag strip.
- `apps/scramble/src/Game.jsx` — Task 0 fix, enable Cyclic, wire `useCyclicDrag` + `onShift`.
- `apps/scramble/src/useCyclicDrag.js` — new; gesture + spring.
- `apps/scramble/package.json` — `@use-gesture/react`, `@react-spring/web`.
- Tests: `apps/scramble/test/{mechanics,ui}-test.cjs`. Deploy: `.github/workflows/deploy.yml`
  already builds scramble — no change.
