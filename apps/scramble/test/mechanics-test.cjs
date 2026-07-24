/* Pure-node tests for the scramble move system.
 *
 * mechanics.js is deliberately DOM-free, so the load-bearing logic — is a
 * shuffled board always solvable, are the moves legal, does the win check
 * survive repeated letters — is testable without a browser. That makes this
 * suite fast and deterministic; the UI suite covers the rendered app.
 *
 * parsePuzzle lives in a .jsx file that node can't import, so this harness
 * builds the solution grid itself, mirroring parsePuzzle's block handling
 * (".", "#" and " " are blocks; letters are uppercased).
 */
const fs = require("fs");
const path = require("path");

const MINI_PATH = path.resolve(__dirname, "../../../packages/clue-data/minis/mini-001.json");
const MINI = JSON.parse(fs.readFileSync(MINI_PATH, "utf8"));

function solutionOf(p) {
  const rows = p.size.rows;
  const cols = p.size.cols;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const src = String(p.grid[r] ?? "").toUpperCase();
    const row = [];
    for (let c = 0; c < cols; c++) {
      const ch = src[c] ?? ".";
      row.push(ch === "." || ch === "#" || ch === " " ? null : ch);
    }
    out.push(row);
  }
  return out;
}

// Seeded RNG so any failure reproduces exactly.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

(async () => {
  const M = await import("../src/mechanics.js");
  const solution = solutionOf(MINI);
  const checks = [];
  const ok = (name, cond) => checks.push([name, !!cond]);

  // --- a solved board reads as solved -------------------------------------
  ok("solved swap state is solved", M.isSolved(M.createState(solution, "swap"), solution));

  // --- repeated letters: tiles are anonymous ------------------------------
  // mini-001 repeats A, E, R, T, C. Swapping two identical letters must still
  // read as solved, because what's checked is the letter shown, not tile identity.
  const solvedSwap = M.createState(solution, "swap");
  const open = M.openCellsOf(solution);
  let pair = null;
  for (let i = 0; i < open.length && !pair; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const [ar, ac] = open[i];
      const [br, bc] = open[j];
      if (solution[ar][ac] === solution[br][bc]) { pair = [open[i], open[j]]; break; }
    }
  }
  ok("mini-001 has a repeated letter to test with", !!pair);
  if (pair) {
    const swapped = M.applyMove(solvedSwap, { type: "swap", a: pair[0], b: pair[1] }, solution);
    ok("swapping two identical letters still reads solved", M.isSolved(swapped, solution));
  }

  // --- solvability by construction, over all six mechanic × empties combos --
  // The movable set is the axis under test: Locked pins blocks (only letters
  // move); Unlocked makes blocks movable tokens (they travel). Both stay
  // solvable by construction — the recorded inverse path always re-solves.
  for (const mechanic of M.MECHANICS) {
    for (const empties of ["locked", "unlocked"]) {
      let allSolvable = true;
      let allScrambled = true;
      let blocksIntact = true;
      let blocksMoved = false;
      let oneGap = true;

      for (let seed = 1; seed <= 40; seed++) {
        const rnd = mulberry32(seed);
        const { state, undoPath } = M.scrambleUnsolved(solution, mechanic, undefined, rnd, empties);
        if (M.isSolved(state, solution)) allScrambled = false;

        for (let r = 0; r < solution.length; r++) {
          for (let c = 0; c < solution[r].length; c++) {
            const wasBlock = solution[r][c] === null;
            const isBlock = state.board[r][c] === null;
            if (wasBlock !== isBlock) { blocksMoved = true; blocksIntact = false; }
          }
        }

        // slide must keep exactly one gap while the tray is held
        if (mechanic === "slide") {
          let gaps = 0;
          for (const row of state.board) for (const cell of row) if (cell === "") gaps++;
          if (gaps !== 1) oneGap = false;
        }

        // walking the recorded inverse path must land exactly on the solution
        let s = state;
        for (const move of undoPath) s = M.applyMove(s, move, solution);
        if (mechanic === "slide") s = M.applyMove(s, { type: "place" }, solution);
        if (!M.isSolved(s, solution)) allSolvable = false;
      }

      ok(`${mechanic}/${empties}: 40 seeds all scramble away from solved`, allScrambled);
      ok(`${mechanic}/${empties}: 40 seeds all solvable via recorded path`, allSolvable);
      if (empties === "locked") ok(`${mechanic}/locked: blocks stay pinned`, blocksIntact);
      else ok(`${mechanic}/unlocked: a block travels on some seed`, blocksMoved);
      if (mechanic === "slide") ok(`slide/${empties}: exactly one gap on the board`, oneGap);
    }
  }

  // --- slide legality ------------------------------------------------------
  const rnd = mulberry32(7);
  const slide = M.scrambleUnsolved(solution, "slide", undefined, rnd).state;
  const moves = M.legalMoves(slide, solution);
  const [gr, gc] = slide.gap;
  ok(
    "slide: every legal move is orthogonally adjacent to the gap",
    moves.filter((m) => m.type === "slide").every(
      (m) => Math.abs(m.from[0] - gr) + Math.abs(m.from[1] - gc) === 1
    )
  );
  ok("slide: there is at least one legal move", moves.length > 0);

  // The tray may only be dropped once the gap is manoeuvred back home.
  const gapAtHome = slide.gap[0] === slide.gapHome[0] && slide.gap[1] === slide.gapHome[1];
  ok(
    "slide: 'place' offered only when the gap is home",
    moves.some((m) => m.type === "place") === gapAtHome
  );

  // --- cyclic shift legality (row 2 = FAULT, no blocks: locked ≡ unlocked) --
  {
    const cyc = M.createState(solution, "cyclic");
    const before = cyc.board.map((row) => row.slice());
    const shifted = M.applyMove(cyc, { type: "shift", axis: "row", index: 2, dir: 1 }, solution);
    let onlyRow2 = true;
    for (let r = 0; r < solution.length; r++) {
      for (let c = 0; c < solution[r].length; c++) {
        if (shifted.board[r][c] !== before[r][c] && r !== 2) onlyRow2 = false;
      }
    }
    ok("cyclic: a row shift changes only that row", onlyRow2);

    const back = M.applyMove(shifted, { type: "shift", axis: "row", index: 2, dir: -1 }, solution);
    let restored = true;
    for (let r = 0; r < solution.length; r++)
      for (let c = 0; c < solution[r].length; c++)
        if (back.board[r][c] !== before[r][c]) restored = false;
    ok("cyclic: +1 then -1 restores the line", restored);

    // a column shift touches only that column (col 0 = ..FAN has blocks)
    const colShift = M.applyMove(cyc, { type: "shift", axis: "col", index: 0, dir: 1 }, solution);
    let onlyCol0 = true;
    for (let r = 0; r < solution.length; r++)
      for (let c = 0; c < solution[r].length; c++)
        if (colShift.board[r][c] !== before[r][c] && c !== 0) onlyCol0 = false;
    ok("cyclic: a column shift changes only that column", onlyCol0);
  }

  // --- cyclic on a BLOCK-BEARING line: locked pins, unlocked travels -------
  // Row 0 of mini-001 is `..CAP` = [null,null,"C","A","P"].
  {
    const row0 = JSON.stringify(solution[0]);
    ok("test fixture: row 0 is [_,_,C,A,P]", row0 === JSON.stringify([null, null, "C", "A", "P"]));

    // Locked (default): blocks at cols 0,1 stay null; C,A,P cycle among 2,3,4.
    const locked = M.createState(solution, "cyclic");
    const lShift = M.applyMove(locked, { type: "shift", axis: "row", index: 0, dir: 1 }, solution);
    ok("locked cyclic: row 0 letters cycle to [_,_,P,C,A], blocks pinned",
       JSON.stringify(lShift.board[0]) === JSON.stringify([null, null, "P", "C", "A"]));

    // Unlocked: the whole line rotates, so a block travels off col 0/1.
    const unlocked = M.createState(solution, "cyclic", Math.random, "unlocked");
    const uShift = M.applyMove(unlocked, { type: "shift", axis: "row", index: 0, dir: 1 }, solution);
    ok("unlocked cyclic: row 0 whole line rotates to [P,_,_,C,A]",
       JSON.stringify(uShift.board[0]) === JSON.stringify(["P", null, null, "C", "A"]));

    // Legal-move pruning: a line with <2 movable cells offers no shift. Under
    // locked, a hypothetical all-but-one-block row would be pruned; here every
    // mini-001 line has >=2 letters, so all 5 rows + 5 cols are offered.
    const legalCyc = M.legalMoves(locked, solution).filter((m) => m.type === "shift");
    ok("locked cyclic: every row+col offers a shift (>=2 movable each)", legalCyc.length === 20);
  }

  // --- report --------------------------------------------------------------
  const bad = checks.filter(([, pass]) => !pass);
  for (const [name, pass] of checks) console.log(`${pass ? "ok   " : "FAIL "}${name}`);
  console.log(bad.length ? `\n${bad.length} mechanics checks failed.` : "\nMove system holds.");
  process.exit(bad.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
