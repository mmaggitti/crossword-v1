/* The scramble move system — pure, no DOM, no React.
 *
 * A board is a 2-D array parallel to the puzzle's solution grid:
 *     "A"   a letter tile
 *     ""    the gap            (slide mode only)
 *     null  a block            (mirrors solution[r][c] === null)
 *
 * State: { mechanic, emptiesMode, board, gap, gapHome, tray }
 *   emptiesMode  "locked"  → blocks are fixed walls; only letters move.
 *                "unlocked"→ blocks are ordinary movable tokens (they travel).
 *   gap      [r,c] of the empty cell, or null
 *   gapHome  [r,c] the gap started at — the only cell the tray letter belongs in
 *   tray     the letter displaced to make the gap, or null once placed
 *
 * TWO ORTHOGONAL AXES.
 *   1. `mechanic` — HOW tiles move: swap (exchange two), slide (15-puzzle gap),
 *      cyclic (rotate a line).
 *   2. `emptiesMode` — WHICH cells are movable. This collapses "locked vs
 *      unlocked" to a single predicate, `isFixed`, and every mechanic is written
 *      ONCE over "the movable cells" (see `movableCellsOf` / `movableAlong`). The
 *      same code yields both behaviors — e.g. a cyclic shift rotates only the
 *      movable cells of a line, so Locked cycles the letters around pinned blocks
 *      and Unlocked rotates the whole line. Adding a mechanic = one `MECH` entry
 *      + one generator; adding a cross-cutting rule = one predicate.
 *
 * Solvability is guaranteed by construction: scramble() only ever applies LEGAL
 * moves starting from the solved board, and records the inverse of each, so a
 * full solution path always exists — for every mechanic × emptiesMode combo.
 */

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const sameCell = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

// Move equality — used by scramble to avoid immediately undoing the last move.
function sameMove(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === "swap") return sameCell(a.a, b.a) && sameCell(a.b, b.b);
  if (a.type === "slide") return sameCell(a.from, b.from);
  if (a.type === "shift") return a.axis === b.axis && a.index === b.index && a.dir === b.dir;
  return true;
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

// ── the movable set ─────────────────────────────────────────────────────────
// The one source of truth for "locked vs unlocked". Locked pins blocks (they're
// walls); unlocked pins nothing (a block is a movable null-token, like a letter).

/** Is cell (r,c) held fixed by the empties rule? */
export function isFixed(solution, emptiesMode, r, c) {
  return emptiesMode !== "unlocked" && solution[r][c] === null;
}

/** Non-block cells (the letters + slide gap home). Kept for slide setup / compat. */
export function openCellsOf(solution) {
  const out = [];
  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < solution[r].length; c++) {
      if (solution[r][c] !== null) out.push([r, c]);
    }
  }
  return out;
}

/** Every movable cell of the board — swap enumerates pairs of these. */
export function movableCellsOf(solution, emptiesMode) {
  const out = [];
  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < solution[r].length; c++) {
      if (!isFixed(solution, emptiesMode, r, c)) out.push([r, c]);
    }
  }
  return out;
}

/** The movable indices along one row/column, in order — the ring a shift
 *  rotates, and the cells a slide gap may traverse. */
function movableAlong(solution, emptiesMode, axis, index) {
  const out = [];
  if (axis === "row") {
    for (let c = 0; c < solution[index].length; c++) {
      if (!isFixed(solution, emptiesMode, index, c)) out.push(c);
    }
  } else {
    for (let r = 0; r < solution.length; r++) {
      if (!isFixed(solution, emptiesMode, r, index)) out.push(r);
    }
  }
  return out;
}

/** Rotate the VALUES sitting at the `mov` positions of `line` by `dir`; cells
 *  not in `mov` are untouched. Slot mov[k] receives the value from mov[k-dir]
 *  (dir +1 moves content to the next movable index). <2 movable ⇒ no-op.
 *  With mov = every index (unlocked), this is the plain whole-line rotation. */
function rotateMovable(line, mov, dir) {
  const m = mov.length;
  const out = line.slice();
  if (m < 2) return out;
  for (let k = 0; k < m; k++) {
    out[mov[k]] = line[mov[((k - dir) % m + m) % m]];
  }
  return out;
}

// ── mechanic registry ───────────────────────────────────────────────────────
// Only the genuinely mechanic-specific surface lives here: the legal-move
// generator, optional state setup, and the shuffle depth. applyMove / inverseMove
// / isSolved stay shared and dispatch on move.type (the solver's BFS relies on
// that), so they never grow a per-mechanic branch.

function swapMoves(state, solution, mode) {
  const cells = movableCellsOf(solution, mode);
  const out = [];
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      out.push({ type: "swap", a: cells[i], b: cells[j] });
    }
  }
  return out;
}

function cyclicMoves(state, solution, mode) {
  // Every row/column is a carousel; a shift rotates its MOVABLE cells. Prune
  // lines with <2 movable cells — their shift is a no-op (and would self-loop).
  const out = [];
  const rows = solution.length, cols = solution[0].length;
  for (let r = 0; r < rows; r++) {
    if (movableAlong(solution, mode, "row", r).length >= 2) {
      out.push({ type: "shift", axis: "row", index: r, dir: 1 });
      out.push({ type: "shift", axis: "row", index: r, dir: -1 });
    }
  }
  for (let c = 0; c < cols; c++) {
    if (movableAlong(solution, mode, "col", c).length >= 2) {
      out.push({ type: "shift", axis: "col", index: c, dir: 1 });
      out.push({ type: "shift", axis: "col", index: c, dir: -1 });
    }
  }
  return out;
}

function slideMoves(state, solution, mode) {
  // Any movable tile orthogonally adjacent to the gap can move into it. Under
  // locked a block is fixed (a wall); under unlocked a block slides like a tile.
  const out = [];
  if (!state.gap) return out;
  const [gr, gc] = state.gap;
  for (const [dr, dc] of DIRS) {
    const r = gr + dr;
    const c = gc + dc;
    if (r < 0 || r >= solution.length || c < 0 || c >= solution[r].length) continue;
    if (isFixed(solution, mode, r, c)) continue;   // wall (locked)
    if (state.board[r][c] === "") continue;         // (shouldn't happen: one gap)
    out.push({ type: "slide", from: [r, c] });
  }
  // The tray letter only ever belongs in the cell the gap started from, so it
  // can be dropped exactly when the gap has been manoeuvred back there.
  if (state.tray != null && sameCell(state.gap, state.gapHome)) {
    out.push({ type: "place" });
  }
  return out;
}

// The gap's home is always a LETTER cell (the tray holds a letter). Under
// unlocked the gap may wander onto block cells during play, but it starts/ends
// home at a letter — so setup is identical in both empties modes.
function slideSetup(state, solution, rnd) {
  const open = openCellsOf(solution);
  const [r, c] = open[Math.floor(rnd() * open.length)];
  state.gapHome = [r, c];
  state.tray = solution[r][c];
  state.board[r][c] = "";
  state.gap = [r, c];
}

const MECH = {
  swap:   { steps: 40, legal: swapMoves,   setup: null },
  slide:  { steps: 60, legal: slideMoves,  setup: slideSetup },
  cyclic: { steps: 12, legal: cyclicMoves, setup: null },
};

export const MECHANICS = Object.keys(MECH);
export const DEFAULT_STEPS = Object.fromEntries(MECHANICS.map((m) => [m, MECH[m].steps]));

/** A solved state for the given mechanic (slide also opens its gap + tray). */
export function createState(solution, mechanic, rnd = Math.random, emptiesMode = "locked") {
  const state = {
    mechanic,
    emptiesMode,
    board: cloneBoard(solution),
    gap: null,
    gapHome: null,
    tray: null,
  };
  MECH[mechanic].setup?.(state, solution, rnd);
  return state;
}

/** Every move legal from here. */
export function legalMoves(state, solution) {
  return MECH[state.mechanic].legal(state, solution, state.emptiesMode ?? "locked");
}

/** Apply a move. `solution` is needed only by `shift` (to know the movable set),
 *  so it is symmetric with legalMoves/isSolved. Swap/slide/place/unplace treat a
 *  null block token like any other value, so they need no geometry. */
export function applyMove(state, move, solution) {
  const next = { ...state, board: cloneBoard(state.board) };
  const mode = state.emptiesMode ?? "locked";
  if (move.type === "swap") {
    const [ar, ac] = move.a;
    const [br, bc] = move.b;
    const held = next.board[ar][ac];
    next.board[ar][ac] = next.board[br][bc];
    next.board[br][bc] = held;
  } else if (move.type === "slide") {
    const [fr, fc] = move.from;
    const [gr, gc] = next.gap;
    next.board[gr][gc] = next.board[fr][fc];
    next.board[fr][fc] = "";
    next.gap = [fr, fc];
  } else if (move.type === "place") {
    const [hr, hc] = next.gapHome;
    next.board[hr][hc] = next.tray;
    next.tray = null;
    next.gap = null;
  } else if (move.type === "unplace") {
    const [hr, hc] = next.gapHome;
    next.tray = next.board[hr][hc];
    next.board[hr][hc] = "";
    next.gap = [hr, hc];
  } else if (move.type === "shift") {
    const b = next.board;
    if (move.axis === "row") {
      const mov = movableAlong(solution, mode, "row", move.index);
      b[move.index] = rotateMovable(b[move.index], mov, move.dir);
    } else {
      const mov = movableAlong(solution, mode, "col", move.index);
      const col = b.map((row) => row[move.index]);
      const rot = rotateMovable(col, mov, move.dir);
      for (let r = 0; r < b.length; r++) b[r][move.index] = rot[r];
    }
  }
  return next;
}

/** The move that undoes `move`, given the state it was applied to. */
export function inverseMove(move, prevState) {
  if (move.type === "swap") return move;                              // self-inverse
  if (move.type === "slide") return { type: "slide", from: prevState.gap };
  if (move.type === "place") return { type: "unplace" };
  if (move.type === "unplace") return { type: "place" };
  // A shift over the movable ring is self-inverting: the ring depends only on
  // (solution, emptiesMode), constant across the pair, so -dir undoes +dir.
  if (move.type === "shift") return { type: "shift", axis: move.axis, index: move.index, dir: -move.dir };
  return move;
}

/** Positional match on EVERY cell — letters and blocks alike. Repeated letters
 *  are fine (tiles are anonymous). Blocks are checked too: they move under
 *  unlocked (and under locked cyclic they don't, so the check is a harmless
 *  no-op there). */
export function isSolved(state, solution) {
  if (state.tray != null) return false;   // slide: last letter still in hand
  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < solution[r].length; c++) {
      if (state.board[r][c] !== solution[r][c]) return false;
    }
  }
  return true;
}

/**
 * Shuffle by walking the solved board backwards along legal moves.
 * Returns { state, undoPath } where applying undoPath in order re-solves it —
 * which is exactly what the solvability test asserts.
 */
export function scramble(solution, mechanic, steps = DEFAULT_STEPS[mechanic] ?? 40, rnd = Math.random, emptiesMode = "locked") {
  let state = createState(solution, mechanic, rnd, emptiesMode);
  const undoPath = [];
  let lastInverse = null;

  for (let i = 0; i < steps; i++) {
    // Never "place" mid-shuffle — the tray is filled at the end, not during.
    let moves = legalMoves(state, solution).filter((m) => m.type !== "place");
    // Don't immediately undo the previous move, or the walk stalls in place.
    if (lastInverse) {
      const forward = moves.filter((m) => !sameMove(m, lastInverse));
      if (forward.length) moves = forward;
    }
    if (!moves.length) break;

    const move = moves[Math.floor(rnd() * moves.length)];
    const inv = inverseMove(move, state);
    undoPath.unshift(inv);
    lastInverse = inv;
    state = applyMove(state, move, solution);
  }

  return { state, undoPath };
}

/** Scramble, retrying if the shuffle happened to land back on the solution. */
export function scrambleUnsolved(solution, mechanic, steps, rnd = Math.random, emptiesMode = "locked") {
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = scramble(solution, mechanic, steps, rnd, emptiesMode);
    if (!isSolved(result.state, solution)) return result;
  }
  return scramble(solution, mechanic, steps, rnd, emptiesMode);
}
