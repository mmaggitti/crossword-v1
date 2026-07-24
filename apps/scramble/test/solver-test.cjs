/* Pure-node tests for the hint solver.
 *
 * A wrong hint is worse than no hint, so this suite is adversarial about two
 * things: VALIDITY (does the returned sequence actually reach the solved board?)
 * and OPTIMALITY (is the reported count truly the minimum?). Optimality is
 * cross-checked against an INDEPENDENT brute-force minimum computed here — a
 * different implementation than the solver's, so a shared bug can't hide.
 *
 * Everything is seeded, so any failure reproduces exactly.
 */
const fs = require("fs");
const path = require("path");

const MINI5 = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../../packages/clue-data/minis/mini-001.json"), "utf8")
);

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mirrors parsePuzzle's block handling (".", "#", " " -> block; letters upcased).
function solutionOf(p) {
  const out = [];
  for (let r = 0; r < p.size.rows; r++) {
    const src = String(p.grid[r] ?? "").toUpperCase();
    const row = [];
    for (let c = 0; c < p.size.cols; c++) {
      const ch = src[c] ?? ".";
      row.push(ch === "." || ch === "#" || ch === " " ? null : ch);
    }
    out.push(row);
  }
  return out;
}

const SOL3 = ["VOW", "AWE", "NET"].map((w) => w.split("")); // full 3x3, no blocks

(async () => {
  const M = await import("../src/mechanics.js");
  const S = await import("../src/solver.js");
  const { createState, scrambleUnsolved, applyMove, isSolved, legalMoves } = M;
  const { solve, humanizeMove } = S;

  const checks = [];
  const ok = (name, cond) => checks.push([name, !!cond]);

  const keyOf = (st) => {
    let s = "";
    for (const row of st.board) { for (const v of row) s += v === null ? "#" : v === "" ? "." : v; s += "|"; }
    if (st.tray != null) s += ">" + st.tray;
    return s;
  };
  const applies = (state, sol, moves) => {
    let s = state;
    for (const mv of moves) s = applyMove(s, mv);
    return isSolved(s, sol);
  };
  // INDEPENDENT brute-force minimum (BFS), capped. -1 if the cap is hit.
  const bruteMin = (state, sol, cap = 250000) => {
    if (isSolved(state, sol)) return 0;
    const seen = new Set([keyOf(state)]);
    let frontier = [state], depth = 0, n = 0;
    while (frontier.length) {
      depth++;
      const next = [];
      for (const st of frontier) {
        if (++n > cap) return -1;
        for (const mv of legalMoves(st, sol)) {
          const ns = applyMove(st, mv);
          if (isSolved(ns, sol)) return depth;
          const k = keyOf(ns);
          if (!seen.has(k)) { seen.add(k); next.push(ns); }
        }
      }
      frontier = next;
    }
    return -1;
  };
  // INDEPENDENT "is there a solution in < limit moves?" (depth-limited DFS) —
  // used to confirm the swap count can't be beaten, without a full BFS.
  const solvableWithin = (state, sol, limit) => {
    const dfs = (st, left) => {
      if (isSolved(st, sol)) return true;
      if (left === 0) return false;
      for (const mv of legalMoves(st, sol)) if (dfs(applyMove(st, mv), left - 1)) return true;
      return false;
    };
    return dfs(state, limit);
  };

  // --- 3x3, slide + cyclic: valid AND count == true minimum (BFS cross-check) --
  for (const mech of ["slide", "cyclic"]) {
    const steps = mech === "slide" ? 12 : 6; // moderate, so the brute BFS stays fast
    let valid = true, optimal = true, tried = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const { state } = scrambleUnsolved(SOL3, mech, steps, mulberry32(seed * 131 + mech.length));
      const res = solve(state, SOL3);
      tried++;
      if (!res.moves.length || !applies(state, SOL3, res.moves)) valid = false;
      const bm = bruteMin(state, SOL3);
      if (bm >= 0 && res.count !== bm) optimal = false;
    }
    ok(`3x3 ${mech}: every hint sequence reaches the solution (${tried} trials)`, valid);
    ok(`3x3 ${mech}: reported count equals the true minimum`, optimal);
  }

  // --- 3x3, swap: valid AND provably minimal (no shorter solution exists) ------
  {
    let valid = true, optimal = true, checkedOpt = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { state } = scrambleUnsolved(SOL3, "swap", 40, mulberry32(seed * 17));
      const res = solve(state, SOL3);
      if (!res.moves.length || !applies(state, SOL3, res.moves)) valid = false;
      // Confirm no shorter sequence exists (DFS is cheap only for small counts).
      if (res.count <= 4) {
        checkedOpt++;
        if (solvableWithin(state, SOL3, res.count - 1)) optimal = false;
      }
    }
    ok("3x3 swap: every hint sequence reaches the solution", valid);
    ok(`3x3 swap: no shorter sequence exists (${checkedOpt} trials proved minimal)`, optimal && checkedOpt > 0);
  }

  // --- already solved -> zero moves -------------------------------------------
  for (const mech of ["swap", "cyclic"]) {
    const res = solve(createState(SOL3, mech, mulberry32(5)), SOL3);
    ok(`${mech}: an already-solved board needs 0 moves`, res.count === 0 && res.optimal);
  }

  // --- 5x5 with blocks: swap is always valid ----------------------------------
  const SOL5 = solutionOf(MINI5);
  {
    let valid = true;
    for (let seed = 1; seed <= 12; seed++) {
      const { state } = scrambleUnsolved(SOL5, "swap", 40, mulberry32(seed * 23));
      const res = solve(state, SOL5);
      if (!applies(state, SOL5, res.moves)) valid = false;
    }
    ok("5x5 swap (with blocks): analytic solution always reaches the solution", valid);
  }

  // --- 5x5 cyclic, shallow: valid, and minimal where the brute can reach -------
  {
    let valid = true, optimal = true, solvedWithinBudget = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { state } = scrambleUnsolved(SOL5, "cyclic", 3, mulberry32(seed * 41));
      const res = solve(state, SOL5);
      if (res.exhausted) continue;
      solvedWithinBudget++;
      if (!applies(state, SOL5, res.moves)) valid = false;
      const bm = bruteMin(state, SOL5);
      if (bm >= 0 && res.count !== bm) optimal = false;
    }
    ok("5x5 cyclic (shallow, blocks travel): hints are valid", valid);
    ok("5x5 cyclic (shallow): counts match the true minimum where searchable", optimal);
    ok("5x5 cyclic (shallow): solved within budget", solvedWithinBudget > 0);
  }

  // --- 5x5 cyclic, deep: never crash or lie — solve validly OR report exhausted -
  {
    let sane = true;
    for (let seed = 1; seed <= 5; seed++) {
      const { state } = scrambleUnsolved(SOL5, "cyclic", 12, mulberry32(seed * 7 + 3));
      const res = solve(state, SOL5);
      if (res.exhausted) { if (res.count !== Infinity || res.optimal) sane = false; }
      else if (!applies(state, SOL5, res.moves)) sane = false;
    }
    ok("5x5 cyclic (deep): solver either solves validly or reports exhausted", sane);
  }

  // --- humanizeMove: readable instruction + cells to highlight -----------------
  {
    const model3 = { rows: 3, cols: 3, solution: SOL3 };
    const st = createState(SOL3, "cyclic", mulberry32(1));
    const hRow = humanizeMove({ type: "shift", axis: "row", index: 0, dir: 1 }, st, model3);
    ok("humanize: names the top row, arrow, and 3 cells", /top row/.test(hRow.label) && hRow.arrow === "→" && hRow.cells.length === 3);
    const hCol = humanizeMove({ type: "shift", axis: "col", index: 2, dir: -1 }, st, model3);
    ok("humanize: names the right column and up arrow", /right column/.test(hCol.label) && hCol.arrow === "↑");
    const hSwap = humanizeMove({ type: "swap", a: [0, 0], b: [1, 1] }, createState(SOL3, "swap", mulberry32(2)), model3);
    ok("humanize: swap highlights two cells", hSwap.cells.length === 2 && /[Ss]wap/.test(hSwap.label));
  }

  const bad = checks.filter(([, p]) => !p);
  for (const [name, pass] of checks) console.log(`${pass ? "ok   " : "FAIL "}${name}`);
  console.log(bad.length ? `\n${bad.length} solver checks failed.` : "\nSolver holds.");
  process.exit(bad.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
