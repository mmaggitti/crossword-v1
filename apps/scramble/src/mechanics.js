/* The scramble move system — pure, no DOM, no React.
 *
 * A board is a 2-D array parallel to the puzzle's solution grid:
 *     "A"   a letter tile
 *     ""    the gap            (slide mode only)
 *     null  a block            (mirrors solution[r][c] === null)
 *
 * State: { mechanic, board, gap, gapHome, tray }
 *   gap      [r,c] of the empty cell, or null
 *   gapHome  [r,c] the gap started at — the only cell the tray letter belongs in
 *   tray     the letter displaced to make the gap, or null once placed
 *
 * Every mechanic is a MOVE GENERATOR over that state rather than bespoke
 * board-mutating code. That's the whole point of the shape: adding Cyclic
 * (row/column shifts) — and later a 3-D cube — means writing one more
 * generator, not rewriting the game.
 *
 * Solvability is guaranteed by construction: scramble() only ever applies
 * LEGAL moves starting from the solved board, and records the inverse of each,
 * so a full solution path always exists. (A uniformly random shuffle would not
 * be safe — a sliding puzzle can only reach half of all arrangements, and
 * cyclic shifts reach far fewer still.)
 */

export const MECHANICS = ["swap", "slide", "cyclic"];
export const DEFAULT_STEPS = { swap: 40, slide: 60, cyclic: 12 };

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

export function openCellsOf(solution) {
  const out = [];
  for (let r = 0; r < solution.length; r++) {
    for (let c = 0; c < solution[r].length; c++) {
      if (solution[r][c] !== null) out.push([r, c]);
    }
  }
  return out;
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

/** A solved state for the given mechanic (slide also opens its gap + tray). */
export function createState(solution, mechanic, rnd = Math.random) {
  const state = {
    mechanic,
    board: cloneBoard(solution),
    gap: null,
    gapHome: null,
    tray: null,
  };
  if (mechanic === "slide") {
    const open = openCellsOf(solution);
    const [r, c] = open[Math.floor(rnd() * open.length)];
    state.gapHome = [r, c];
    state.tray = solution[r][c];
    state.board[r][c] = "";
    state.gap = [r, c];
  }
  return state;
}

/** Every move legal from here. */
export function legalMoves(state, solution) {
  if (state.mechanic === "swap") {
    const open = openCellsOf(solution);
    const out = [];
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) {
        out.push({ type: "swap", a: open[i], b: open[j] });
      }
    }
    return out;
  }

  if (state.mechanic === "cyclic") {
    // Every row and every column is a carousel; a shift rotates the whole line
    // (blocks travel with it). dir +1 moves content to the next index.
    const out = [];
    const rows = solution.length, cols = solution[0].length;
    for (let r = 0; r < rows; r++) {
      out.push({ type: "shift", axis: "row", index: r, dir: 1 });
      out.push({ type: "shift", axis: "row", index: r, dir: -1 });
    }
    for (let c = 0; c < cols; c++) {
      out.push({ type: "shift", axis: "col", index: c, dir: 1 });
      out.push({ type: "shift", axis: "col", index: c, dir: -1 });
    }
    return out;
  }

  // slide: any tile orthogonally adjacent to the gap can move into it.
  const out = [];
  if (!state.gap) return out;
  const [gr, gc] = state.gap;
  for (const [dr, dc] of DIRS) {
    const r = gr + dr;
    const c = gc + dc;
    if (r < 0 || r >= solution.length || c < 0 || c >= solution[r].length) continue;
    if (solution[r][c] === null) continue;      // block
    if (state.board[r][c] === "") continue;     // (shouldn't happen: one gap)
    out.push({ type: "slide", from: [r, c] });
  }
  // The tray letter only ever belongs in the cell the gap started from, so it
  // can be dropped exactly when the gap has been manoeuvred back there.
  if (state.tray != null && sameCell(state.gap, state.gapHome)) {
    out.push({ type: "place" });
  }
  return out;
}

export function applyMove(state, move) {
  const next = { ...state, board: cloneBoard(state.board) };
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
      const row = b[move.index], n = row.length;
      b[move.index] = row.map((_, i) => row[((i - move.dir) % n + n) % n]);
    } else {
      const n = b.length;
      const col = b.map((row) => row[move.index]);
      for (let r = 0; r < n; r++) b[r][move.index] = col[((r - move.dir) % n + n) % n];
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
  if (move.type === "shift") return { type: "shift", axis: move.axis, index: move.index, dir: -move.dir };
  return move;
}

/** Positional match on EVERY cell — letters and blocks alike. Repeated letters
 *  are fine (tiles are anonymous). Blocks are checked too, because in cyclic
 *  they travel; in swap/slide they never move, so this is a no-op there. */
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
export function scramble(solution, mechanic, steps = DEFAULT_STEPS[mechanic] ?? 40, rnd = Math.random) {
  let state = createState(solution, mechanic, rnd);
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
    state = applyMove(state, move);
  }

  return { state, undoPath };
}

/** Scramble, retrying if the shuffle happened to land back on the solution. */
export function scrambleUnsolved(solution, mechanic, steps, rnd = Math.random) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = scramble(solution, mechanic, steps, rnd);
    if (!isSolved(result.state, solution)) return result;
  }
  return scramble(solution, mechanic, steps, rnd);
}
