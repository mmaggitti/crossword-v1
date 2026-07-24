# apps/scramble — ship the rearrange game (Swap + Slide) to /crossword-v1/scramble/

## Context

We prototyped a "scramble crossword": the same minis, but every letter starts on the board shuffled
and you rearrange them into the solution. Unlike the fill-in player it's **constraint-driven, not
recall-driven** — you can solve it from the crossings and the pool of letters without knowing a
single answer, which is the inclusive hook.

The prototype is live at `/crossword-v1/dev/` and Mark validated it on-device: **Swap** (tap two
tiles) and **Slide** (Unblock-Me style — one gap plus a tray letter) both play well, and a
clue-mode toggle (**None / Jumbled / Labeled**) landed, where Jumbled shows all ten clues as an
unordered, unlabeled pool mirroring the scrambled board.

This plan promotes that throwaway page into a real app in the monorepo, at its own URL, with the
10 bundled minis and a picker. **Cyclic mode is deliberately deferred** — see Phase 2 below.

**Decisions already made:**
- Three mechanics form a **difficulty ladder**, each a self-contained mode: Swap (easy) · Slide
  (medium) · Cyclic (hard). Switching mode re-scrambles; you don't mix mechanics in one solve.
- **Scramble by applying random *legal moves of that mechanic*** from the solved state, so every
  puzzle is guaranteed solvable by reversing them (the 15-puzzle / Rubik's trick). This also dodges
  a real trap: cyclic shifts alone can't reach every arrangement, so a *random* shuffle would
  sometimes be impossible.
- Green-when-home is a **cue only** — it must not immobilize the tile, or Slide/Cyclic can strand
  the remaining letters.
- Clues are an optional assist, defaulting to off.

## Approach

### Phase 1 — Scaffold the app
`apps/scramble/` alongside `apps/player/`, same shape: `index.html`, `vite.config.js`,
`package.json`, `src/{main.jsx, App.jsx, Picker.jsx}`. Copy the player's Vite config pattern —
crucially the **source aliases** for `@crossword/core` and `@crossword/clue-data` plus their
`optimizeDeps` exclusion, since JSX inside a workspace package isn't transformed otherwise.
Reuse from `@crossword/core`: **`parsePuzzle`** (gives the solution grid = the win target, plus
entries/geometry) and **`TOKENS`** (the §11 design system, so it looks like the player).
Reuse `@crossword/clue-data` for the 10 minis.

### Phase 2 — The move system (`src/mechanics.js`)
Model board state as a **permutation of the solution**, and each mechanic as a **move-generator** —
this is what keeps Cyclic (and a future 3D cube) a drop-in rather than a rewrite.
```
legalMoves(state, mechanic) -> Move[]
applyMove(state, move) -> state
scramble(solution, mechanic, n) -> state     // n random legal moves from solved
isSolved(state, solution)                    // positional letter match (handles repeated letters)
```
- **Swap:** any two cells trade places. Board stays fully packed.
- **Slide:** one cell is a gap and its letter sits in a **tray**; a tile orthogonally adjacent to the
  gap slides in. Solved = all 18 placed letters home, gap back at its origin, tray letter dropped in.
  (The tray exists because a finished crossword fills every cell — there's no room to slide
  otherwise. This is the crux the prototype proved out.)
- Record a move history for **Undo**.

### Phase 3 — Board, picker, routing, clue modes
- `Board.jsx`: renders the grid from `parsePuzzle` geometry — blocks, tiles, gap, tray, cell
  numbers; green when a letter is home; selection state for Swap; "movable" affordance for Slide.
  This is a **new component, not `GridDOM`** — the interaction model genuinely differs (tile moving
  vs cursor typing), so sharing the renderer would distort both.
- `Picker.jsx` + hash routing mirroring the player (`apps/player/src/App.jsx`): `#<mini-id>` a mini,
  `#sample`, empty → picker.
- Controls: mode toggle (Swap | Slide | **Cyclic disabled/"soon"**), move counter, Undo, Shuffle,
  and the **None / Jumbled / Labeled** clue toggle from the prototype (Jumbled = all clues, no
  labels, no order, no lengths).
- Win: reuse the player's green solve treatment for consistency.

### Phase 4 — Tests (they gate the deploy)
Add `apps/scramble/test/*.cjs` following the player's harness — reuse the `_serve.cjs` static-server
pattern and give every suite a real `process.exit(1)`, since CI blocks on them:
- scramble-solvability: a scrambled board is reachable back to solved (reverse the recorded moves).
- mechanics: Swap swaps; Slide only moves gap-adjacent tiles; tray places only at its home cell.
- win: `isSolved` fires exactly when every cell matches (including repeated letters).

### Phase 5 — Deploy to /crossword-v1/scramble/
Extend `.github/workflows/deploy.yml` to build **both** apps and assemble one Pages artifact —
the same move as the existing dev-prototype copy step:
```yaml
- run: npm run build --workspace player     # BASE_PATH=/crossword-v1/
- run: npm run build --workspace scramble   # BASE_PATH=/crossword-v1/scramble/
- run: mkdir -p apps/player/dist/scramble && cp -r apps/scramble/dist/* apps/player/dist/scramble/
```
The service worker already tolerates this: the `navigateFallbackDenylist` `[/^\/crossword-v1\/.+/]`
added earlier means sub-paths go to the network instead of being swallowed by the player shell.
Leave `/crossword-v1/dev/` in place as the scratch playground.

## Critical files
- New: `apps/scramble/**` (`src/{main,App,Picker,Board,mechanics}.jsx|js`, `test/*.cjs`).
- `apps/player/vite.config.js` — copy its alias/optimizeDeps pattern (don't invent a new one).
- `packages/core/src/index.js` — confirm `parsePuzzle` + `TOKENS` are exported (they are);
  `usePuzzle`/`GridDOM` stay module-private, scramble doesn't need them.
- `.github/workflows/deploy.yml` — second build + artifact assembly.
- Reference implementation: `dev/index.html` — the validated Swap/Slide/clue-mode logic to port.

## Phase 2 (next, not built now) — Word squares, then Cyclic
Feasibility was already measured; keep these numbers so it isn't re-researched:
- **24,835** distinct 5-letter answers in the xd corpus (8,506 in the plain dictionary); ~5,251 used
  ≥100×; **median 6 real clues each**.
- 10-distinct (non-symmetric) squares are abundant: **109,806** across just 10 common first rows.
- Only **1** blockless 5×5 word square exists in **89,194** published crosswords — a distinctive type.
- Quality is the real constraint: the raw dictionary yields obscure fill; Mark's 666-word bank yields
  only **23** squares, **all symmetric**. Fix = a **frequency-scored** bank from xd.
- Design: score every square by the **average commonness of its 10 words** (an adjustable difficulty
  lever), and show a clue **only for words below a rarity threshold** — everyday words unclued,
  SAT/spelling-bee words clued. Puzzle data carries all clues + per-word scores; the **app applies
  the threshold at runtime** so the lever slides without regenerating. `gen2.py` (inside
  `_collateral/clue-bank-and-generator.zip`) already does MRV + forward-checking fills and needs only
  a one-line `"open-5x5"` all-open pattern plus the bigger bank.
- **Why it comes before Cyclic:** blocks chop rows/columns into ragged fragments, so "shift a row and
  wrap" is ill-defined. A blockless 5×5 is a clean 5-cell ring per row and column — the substrate
  Cyclic needs. Longer term the same rail supports foreign-language vocabulary.

## Verification
1. `npm test` — the **9 player suites stay green** plus the new scramble suites (CI gates on these).
2. **Browser pane:** picker lists 10 minis; Swap and Slide each play and detect a win; all three clue
   modes render; `read_console_messages {onlyErrors:true}` clean.
3. **iOS Simulator:** solve one puzzle end-to-end in each mode on-device (the only place touch and
   layout are truly proven), plus a screenshot of the win state.
4. **Live:** after deploy, `/crossword-v1/scramble/` serves the app, and `/crossword-v1/` (player) and
   `/crossword-v1/dev/` (prototype) are both unaffected.
