/* The hint solver — pure, no DOM, no React.
 *
 * Given a scrambled state it finds a restoring sequence and reports whether that
 * sequence is provably the SHORTEST. It reuses the mechanic's own move system
 * (legalMoves / applyMove / isSolved from mechanics.js), so it automatically
 * respects every quirk — the slide tray, the empties mode (pinned vs.
 * travelling blocks), etc.
 *
 *   solve(state, solution) -> {
 *     moves:     Move[]    // the sequence; moves[0] is the next best move
 *     count:     number    // moves.length (Infinity if unsolved)
 *     optimal:   boolean   // true when `count` is provably the minimum
 *     exhausted: boolean   // true when the search hit its budget without solving
 *   }
 *
 * Slide and Cyclic are searched with breadth-first search, which returns the
 * true minimum. BFS is exhaustive, so it's capped: it always solves a 3x3 (the
 * whole reachable space is well under the cap) and any position within ~a
 * handful of moves of the finish on 5x5 — which is exactly when a hint matters.
 * Beyond that it reports `exhausted` rather than guess.
 *
 * Swap can't be searched (its branching factor is every pair of tiles), but it
 * has a direct optimal answer: keep every already-correct tile in place, then
 * clear the rest cycle by cycle, preferring swaps that seat two tiles at once.
 */
import { applyMove, isSolved, legalMoves, movableCellsOf } from "./mechanics.js";

// Caps the BFS. 3x3 reachable spaces (cyclic 90720, slide 90720) sit under this,
// so a 3x3 is always solved; on 5x5 it bounds the work to a brief on-press pause.
const NODE_BUDGET = 200000;

// A position's identity: the letters/blocks/gap on the board, plus the slide
// tray (the un-placed last letter). gapHome and mechanic are constant per solve.
function keyOf(state) {
  let s = "";
  for (const row of state.board) {
    for (const v of row) s += v === null ? "#" : v === "" ? "." : v;
    s += "|";
  }
  if (state.tray != null) s += ">" + state.tray;
  return s;
}

const cellKey = (cell) => `${cell[0]},${cell[1]}`;

// Optimal swap solution. Every tile already home stays put (moving it only costs
// a swap to fix again); the rest are seated one swap at a time, preferring a
// donor that also lands home (a 2-cycle) so two tiles are fixed at once.
function solveSwap(state, solution) {
  const cur = state.board.map((row) => row.slice());
  // The movable set — under unlocked this includes block cells (need may be
  // null, treated as just another value to match), so displaced blocks are
  // restored too; under locked it is exactly the letter cells.
  const cells = movableCellsOf(solution, state.emptiesMode ?? "locked");
  const moves = [];
  for (const [r, c] of cells) {
    if (cur[r][c] === solution[r][c]) continue;
    const need = solution[r][c];
    let two = null;
    let one = null;
    for (const [r2, c2] of cells) {
      if (r2 === r && c2 === c) continue;
      if (cur[r2][c2] !== need) continue;
      if (cur[r2][c2] === solution[r2][c2]) continue; // never disturb a seated tile
      if (solution[r2][c2] === cur[r][c]) { two = [r2, c2]; break; } // seats both
      if (!one) one = [r2, c2];
    }
    const donor = two || one;
    if (!donor) continue; // unreachable on a solvable board
    const [r2, c2] = donor;
    const held = cur[r][c];
    cur[r][c] = cur[r2][c2];
    cur[r2][c2] = held;
    moves.push({ type: "swap", a: [r, c], b: [r2, c2] });
  }
  return { moves, count: moves.length, optimal: true, exhausted: false };
}

// Breadth-first search over the mechanic's legal moves — the first time the
// solved board appears it's by a shortest path. Bounded by NODE_BUDGET.
function bfs(state, solution) {
  const startKey = keyOf(state);
  const seen = new Set([startKey]);
  const parent = new Map(); // key -> { prev, move }
  let frontier = [state];
  let expanded = 0;

  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      if (++expanded > NODE_BUDGET) {
        return { moves: [], count: Infinity, optimal: false, exhausted: true };
      }
      const stKey = keyOf(st);
      for (const mv of legalMoves(st, solution)) {
        const ns = applyMove(st, mv, solution);
        const k = keyOf(ns);
        if (seen.has(k)) continue;
        seen.add(k);
        parent.set(k, { prev: stKey, move: mv });
        if (isSolved(ns, solution)) {
          const path = [];
          let cur = k;
          while (cur !== startKey) {
            const step = parent.get(cur);
            path.push(step.move);
            cur = step.prev;
          }
          path.reverse();
          return { moves: path, count: path.length, optimal: true, exhausted: false };
        }
        next.push(ns);
      }
    }
    frontier = next;
  }
  // Exhausted the reachable space without solving — only possible if the board
  // is unsolvable, which the by-construction scramble never produces.
  return { moves: [], count: Infinity, optimal: false, exhausted: true };
}

export function solve(state, solution) {
  if (isSolved(state, solution)) {
    return { moves: [], count: 0, optimal: true, exhausted: false };
  }
  if (state.mechanic === "swap") return solveSwap(state, solution);
  return bfs(state, solution);
}

// Turn a move into a human hint: a spoken instruction, the cells to highlight,
// and a direction arrow. `model` supplies the grid size for line naming.
export function humanizeMove(move, state, model) {
  if (!move) return null;
  const { rows, cols } = model;

  if (move.type === "swap") {
    return { label: "Swap the two highlighted tiles", cells: [cellKey(move.a), cellKey(move.b)], arrow: null };
  }
  if (move.type === "slide") {
    const [fr, fc] = move.from;
    const [gr, gc] = state.gap || [fr, fc];
    const arrow = gr < fr ? "↑" : gr > fr ? "↓" : gc < fc ? "←" : "→";
    return { label: `Slide the highlighted tile ${arrow} into the gap`, cells: [cellKey(move.from)], arrow };
  }
  if (move.type === "place") {
    return { label: "Drop the last letter into the gap", cells: state.gapHome ? [cellKey(state.gapHome)] : [], arrow: null };
  }
  if (move.type === "shift") {
    const isRow = move.axis === "row";
    const name = isRow
      ? lineName(move.index, rows, ["top", "middle", "bottom"], "row")
      : lineName(move.index, cols, ["left", "middle", "right"], "column");
    const arrow = isRow ? (move.dir > 0 ? "→" : "←") : (move.dir > 0 ? "↓" : "↑");
    const cells = [];
    if (isRow) for (let c = 0; c < cols; c++) cells.push(`${move.index},${c}`);
    else for (let r = 0; r < rows; r++) cells.push(`${r},${move.index}`);
    // `line` lets the Board draw ONE outline around the whole row/column — a
    // carousel slides as a single object, so a single frame reads clearer than
    // a ring per cell. `cells` stays for callers that want the members.
    return { label: `Slide the ${name} ${arrow}`, cells, arrow, line: { axis: move.axis, index: move.index } };
  }
  return null;
}

// "top/middle/bottom row" reads naturally on a 3-line grid; fall back to
// "row N" (1-indexed) on anything larger.
function lineName(index, total, words, noun) {
  if (total === 3) return `${words[index]} ${noun}`;
  return `${noun} ${index + 1}`;
}
