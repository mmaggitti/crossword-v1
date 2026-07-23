import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { puzzleFromLocation, copyShareUrl } from "./share.js";

/* ============================================================================
   CROSSWORD PLAYER — v0.1 wireframe
   ----------------------------------------------------------------------------
   Layers, deliberately separated so a Three.js renderer can replace <GridDOM>
   without touching anything above it:

     parsePuzzle(json)  pure  -> geometry: cells, runs, numbering, entries
     usePuzzle(json)    hook  -> play state: cursor, letters, marks, actions
     <GridDOM>          view  -> one consumer of (model, state, onCellTap)
     <ClueBar> <Keys> <ActionBar>

   No DOM assumptions live in parsePuzzle or usePuzzle. See DESIGN.md §4.
   ========================================================================== */

/* ---------------------------------------------------------------- tokens --
   §11.4 green-led instantiation, warm neutral column (the doc's default).
   Dark-mode values are declared but not exposed in v1 — see backlog B5.     */

export const TOKENS = `
.xw {
  /* ===== scale ==========================================================
     Every dimension in this file derives from --u or from --cell.
     --u  : the UI's root unit. vmin ties it to the smaller viewport axis
            so it adapts from phone to tablet to desktop; rem keeps it
            responsive to the reader's own font-size setting; clamp bounds
            both ends so it never becomes absurd.
     --cell: derived in CSS from the stage's container size (below).
     Ratios are unitless multipliers, so retuning the look means editing
     one number here rather than hunting pixel values.                   */

  /* A pure-vmin scale collapses on phones: vmin is the *width* in portrait,
     so 2.4vmin on a 430px screen was 10px and the clamp floor swallowed it,
     pinning the whole UI at minimum on every handset. A rem base plus a
     smaller viewport term grows properly instead — ~17.5px on a phone,
     ~21px on a tablet or desktop. */
  --u: clamp(0.95rem, 0.85rem + 0.9vmin, 1.35rem);

  --text-xs: calc(var(--u) * 0.60);
  --text-sm: calc(var(--u) * 0.76);
  --text-md: calc(var(--u) * 0.95);
  --text-lg: calc(var(--u) * 1.10);
  --text-xl: calc(var(--u) * 1.24);

  --space-xs: calc(var(--u) * 0.22);
  --space-sm: calc(var(--u) * 0.45);
  --space-md: calc(var(--u) * 0.80);
  --space-lg: calc(var(--u) * 1.20);

  --radius:   calc(var(--u) * 0.34);
  --hairline: max(1px, calc(var(--u) * 0.045));

  /* grid proportions, expressed against one cell rather than in pixels */
  --gap-ratio:    0.022;
  --frame-ratio:  0.055;
  --letter-ratio: 0.52;
  /* Ceiling on one cell, relative to the type scale. Without it a 5x5 on a
     tablet renders at ~790px, which is both silly and too tall to sit above
     a keyboard. Never binds on a phone, where width is the constraint. */
  --cell-max: 4.7;
  --number-ratio: 0.22;

  /* screen area the software keyboard covers; JS supplies the measurement,
     CSS decides what to do with it */
  --kb: 0px;

  /* ===== §11.4 palette, warm neutral column ========================== */
  --accent:        #076B3B;
  --accent-deep:   #034D29;
  --accent-deepest:#01341A;
  --accent-soft:   #6BC58C;
  --accent-softest:#CDE8D4;

  --ink:           #000000;
  --muted:         #818180;
  --border:        #CFCFCF;
  --surface:       #FFFFFF;
  --surface-subtle:#F1F1EF;
  --canvas:        #FBF9F4;

  --status-ok:     #B8DAAE;
  --status-warn:   #F2CE9E;
  --status-danger: #F2B0B0;

  --mono: ui-monospace, "SF Mono", SFMono-Regular, "Cascadia Mono", Menlo, Consolas, monospace;
  --sans: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
}

/* Mono for grid material (letters, numbers, run ticks, labels), sans for
   language material (clues, buttons). Structure vs prose, made visible. */

.xw {
  position: fixed; inset: 0;
  display: flex; flex-direction: column;
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--sans);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  touch-action: manipulation;
}

.xw-head {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: var(--space-sm);
  padding: var(--space-md);
  border-bottom: var(--hairline) solid var(--border);
}
.xw-title {
  font-family: var(--mono);
  font-size: var(--text-md); font-weight: 600; letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--accent-deepest);
}
.xw-meta {
  display: flex; align-items: center; gap: var(--space-sm);
  font-family: var(--mono);
  font-size: var(--text-xs); letter-spacing: .06em;
  color: var(--muted);
  margin-left: auto;
}
.xw-hbtn {
  border: var(--hairline) solid var(--border); border-radius: var(--radius);
  background: var(--surface); color: var(--accent-deep);
  font-family: var(--mono); font-size: var(--text-xs); letter-spacing: .08em;
  text-transform: uppercase;
  padding: var(--space-xs) var(--space-sm);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.xw-hbtn:active { background: var(--accent-softest); border-color: var(--accent-soft); }

.xw-toast {
  position: absolute; left: 50%; bottom: calc(var(--space-lg) * 4);
  transform: translateX(-50%);
  max-width: 88%; padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius);
  background: var(--accent-deepest); color: var(--surface);
  font-size: var(--text-sm); line-height: 1.35;
  text-align: center; z-index: 20; pointer-events: none;
}

/* ===== stage + grid =====================================================
   The stage is a size container, so 100cqw / 100cqh are exactly its inner
   width and height. One cell is therefore the largest square that fits both
   axes — computed by the layout engine, with no measurement in JS and no
   pixel constants. --cols / --rows come from the puzzle.               */

.xw-stage {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  container-type: size;
  /* Top-anchored, not centred: the board hangs directly off the clue, and
     any slack collects below it — which is where the keyboard goes anyway. */
  display: flex; flex-direction: column;
  align-items: center; justify-content: flex-start;
  /* The bottom band is reserved for the solved mark whether or not it is
     showing, so solving cannot resize the board underneath you. */
  padding: 0 var(--space-md) calc(var(--space-md) + var(--u) * 2.2);
}

.xw-gridwrap {
  position: relative;
  --cell: min(
    calc(100cqw / var(--cols)),
    calc(100cqh / var(--rows)),
    calc(var(--u) * var(--cell-max))
  );
  --letter: calc(var(--cell) * var(--letter-ratio));
  --number: calc(var(--cell) * var(--number-ratio));

  box-sizing: border-box;
  width:  calc(var(--cell) * var(--cols));
  height: calc(var(--cell) * var(--rows));
  /* backstop if container units are unavailable */
  max-width: 100%; max-height: 100%;
  aspect-ratio: var(--cols) / var(--rows);

  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: calc(var(--cell) * var(--gap-ratio));
  border: calc(var(--cell) * var(--frame-ratio)) solid var(--ink);
  background: var(--border);
  transition: border-color .35s ease;
}
.xw-gridwrap.solved { border-color: var(--accent); }

/* Phase 1: a green stamp over the whole board. --cell is defined on the
   grid wrapper, so the type scales with the puzzle rather than the screen. */
.xw-solve {
  position: absolute; z-index: 5;
  /* inset:0 would sit inside the frame, leaving a rim of border showing.
     Pulling out by the frame width covers the board edge to edge. */
  inset: calc(var(--cell) * var(--frame-ratio) * -1);
  display: flex; align-items: center; justify-content: center;
  background: var(--accent); color: var(--surface);
  font-family: var(--mono); font-weight: 700;
  font-size: calc(var(--cell) * 0.58);
  letter-spacing: .18em;
  pointer-events: none;
  animation: xw-stamp 1500ms ease forwards;
}
@keyframes xw-stamp {
  0%   { opacity: 0; }
  10%  { opacity: 1; }
  74%  { opacity: 1; }
  100% { opacity: 0; }
}

/* Phase 2: the mark that stays, centred under the board on the canvas. */
.xw-solved-mark {
  flex: 0 0 auto;
  margin-top: var(--space-md);
  font-family: var(--mono); font-weight: 700;
  font-size: var(--text-lg);
  letter-spacing: .22em;
  color: var(--accent);
  animation: xw-rise 420ms ease both;
}
@keyframes xw-rise {
  from { opacity: 0; transform: translateY(calc(var(--u) * -0.25)); }
  to   { opacity: 1; transform: none; }
}

.xw-cell {
  position: relative;
  background: var(--surface);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--mono); font-weight: 600;
  font-size: var(--letter);
  line-height: 1;
  min-width: 0; min-height: 0; overflow: hidden;
  color: var(--ink);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background-color .12s ease, color .12s ease;
}
.xw-cell.block  { background: var(--ink); cursor: default; }
.xw-cell.inword { background: var(--accent-softest); }
.xw-cell.cursor { background: var(--accent); color: var(--surface); }
.xw-cell.wrong  { background: var(--status-danger); color: var(--ink); }

.xw-num {
  position: absolute;
  top: calc(var(--cell) * 0.04); left: calc(var(--cell) * 0.07);
  font-family: var(--mono); font-weight: 500;
  font-size: var(--number);
  line-height: 1; color: var(--muted);
  pointer-events: none;
}
.xw-cell.cursor .xw-num { color: var(--accent-softest); }

/* ===== dock =============================================================
   Rides above the keyboard on a transform. Transforms take no part in
   layout, so lifting this cannot move or resize the board.            */

.xw-dock {
  flex: 0 0 auto;
  position: relative;
  z-index: 10;
  background: var(--canvas);
  transform: translateY(calc(-1 * var(--kb)));
}
/* Fills everything below the dock with canvas, without occupying layout
   space. top:100% anchors it to the dock's own bottom edge, so however the
   keyboard geometry lands, grid rows can never show through the strip the
   dock vacates. Clipped by .xw's overflow:hidden. */
.xw-dock::after {
  content: "";
  position: absolute;
  left: 0; right: 0; top: 100%;
  height: 100vh;
  background: var(--canvas);
  pointer-events: none;
}

.xw-update {
  display: flex; align-items: center; gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--accent-softest); color: var(--accent-deepest);
  border-top: var(--hairline) solid var(--accent-soft);
  font-size: var(--text-sm);
}
.xw-update span { flex: 1 1 auto; }
.xw-update button {
  flex: 0 0 auto; border: 0; border-radius: var(--radius);
  padding: var(--space-sm) var(--space-md);
  background: var(--accent); color: var(--surface);
  font-family: var(--sans); font-size: var(--text-sm); font-weight: 600;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.xw-update button:active { background: var(--accent-deep); }

.xw-cluebar {
  flex: 0 0 auto;
  display: flex; align-items: center; gap: var(--space-sm);
  /* No surface, no rule: the pill sits directly on the canvas so it reads
     as an object above the board rather than as its own panel. */
  padding: var(--space-xs) var(--space-md) var(--space-sm);
  /* Reserved height. The clue sits above the board now, so a bar that grew
     or shrank between clues would resize the grid underneath it. Sized for
     the two-line case, so every clue occupies the same space. */
  min-height: calc(var(--u) * 4.35);
}
.xw-arrow {
  flex: 0 0 auto; align-self: stretch;
  padding: 0 var(--space-sm);
  border: 0; background: none;
  color: var(--accent-deep);
  font-family: var(--mono); font-size: var(--text-lg);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  border-radius: var(--radius);
}
.xw-arrow:active { background: var(--surface-subtle); }

.xw-nav { flex: 0 0 auto; display: flex; gap: var(--space-xs); }

.xw-clue {
  flex: 1 1 auto; min-width: 0;
  display: flex; flex-direction: column;
  align-items: flex-start; justify-content: center;
  gap: var(--space-xs);
  padding: 0; background: none; border: 0;
  cursor: pointer; font-family: var(--sans);
  -webkit-tap-highlight-color: transparent;
}

/* Metadata stays quiet — it exists only to name what the pill is. */
.xw-cluetop {
  display: flex; align-items: center; gap: var(--space-sm);
  font-family: var(--mono); font-size: var(--text-xs);
  letter-spacing: .1em; color: var(--muted);
}
/* The clue as a token: pastel fill, flagship green text. 100vmax gives a
   full pill at any height without a pixel radius. Clamped to two lines so
   a long clue truncates rather than reflowing the board. */
.xw-cluetext {
  max-width: 100%;
  padding: calc(var(--space-xs) * 1.4) var(--space-md);
  border-radius: 100vmax;
  background: var(--accent-softest);
  color: var(--accent);
  font-size: var(--text-lg);
  font-weight: 650;
  line-height: 1.25;
  text-align: left;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.xw-action {
  padding: var(--space-sm) var(--space-md)
           calc(var(--space-sm) + env(safe-area-inset-bottom, 0px));
  background: var(--canvas);
}
.xw-actionrow { display: flex; gap: var(--space-sm); }
.xw-btn {
  flex: 1 1 auto;
  padding: var(--space-md);
  /* Two lines' worth, always. The hint wraps to two lines and "Check
     puzzle" doesn't, so without a reserve the row would jump height at the
     exact moment the last square is filled. */
  line-height: 1.3;
  /* border-box, so this has to cover the padding too: two lines of text at
     1.3 line-height, plus the vertical padding. */
  min-height: calc(var(--text-md) * 2.6 + var(--space-md) * 2);
  display: flex; align-items: center; justify-content: center;
  border: 0; border-radius: var(--radius);
  font-family: var(--sans); font-size: var(--text-md); font-weight: 600;
  background: var(--accent); color: var(--surface);
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: background-color .12s ease;
}
.xw-btn:active { background: var(--accent-deep); }
.xw-btn[disabled] {
  background: var(--surface-subtle); color: var(--muted);
  cursor: default; font-weight: 500;
}
.xw-btn.kbd {
  flex: 0 0 auto; min-width: calc(var(--u) * 4.5);
  background: var(--surface); color: var(--accent-deep);
  border: var(--hairline) solid var(--border); font-weight: 500;
}
.xw-btn.kbd:active { background: var(--accent-softest); }

.xw-banner {
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-sm);
  border-radius: var(--radius);
  font-size: var(--text-sm); line-height: 1.35;
  background: var(--accent-softest); color: var(--accent-deepest);
}
.xw-banner.bad { background: var(--status-danger); color: var(--ink); }
/* The solved banner is the whole dock, so it keeps its own spacing. */
.xw-action > .xw-banner:only-child { margin-bottom: 0; padding: var(--space-md); }

/* Hidden, focusable: this is what raises the real keyboard. It stays inside
   the viewport so focusing it does not make Safari scroll to find it.
   16px is the one genuine pixel constant in the file — it is the iOS
   threshold below which focusing an input zooms the page. */
.xw-input {
  /* Near the top, not the middle: iOS pans the visual viewport to reveal a
     focused element, and an input sitting mid-page ends up under the
     keyboard. Up here it is always already visible, so no pan is needed. */
  position: absolute; left: 50%; top: var(--space-sm);
  width: 1px; height: 1px; padding: 0; border: 0;
  font-size: 16px; opacity: 0; pointer-events: none;
  background: transparent; color: transparent; caret-color: transparent;
}

.xw-errors {
  padding: var(--space-sm) var(--space-md);
  font-family: var(--mono); font-size: var(--text-xs); line-height: 1.5;
  color: var(--ink); background: var(--status-warn);
}

/* ===== typing mode =====================================================
   With the keyboard up, screen height is the scarce resource and the board
   is what matters. Shedding the header and the clue's metadata line frees
   enough room to keep the whole board visible at full size, rather than
   shrinking it. Nothing here touches the grid — the board is width-bound on
   a phone, so extra vertical room cannot make it grow. */

.xw.typing .xw-head { display: none; }
.xw.typing .xw-cluetop { display: none; }
.xw.typing .xw-cluebar {
  min-height: calc(var(--u) * 3.45);
  padding: 0 var(--space-md) var(--space-xs);
}
.xw.typing .xw-action {
  padding: var(--space-xs) var(--space-md)
           calc(var(--space-xs) + env(safe-area-inset-bottom, 0px));
}
/* The band held for the SOLVED mark is dead weight while you are still
   typing. Solving blurs the input, so the reserve is always back before the
   mark needs it. */
/* The stage reserves the keyboard's own height while typing, so the grid's
   container is exactly the region that stays visible. Combined with the
   width bound in --cell, the board shrinks by precisely the shortfall and
   no more: on a large phone the chrome we shed is already enough and it
   does not shrink at all. */
.xw.typing .xw-stage {
  padding-bottom: calc(var(--space-md) + var(--kb));
}

@media (prefers-reduced-motion: reduce) {
  .xw * { transition: none !important; }
  .xw-solved-mark { animation: none !important; }
}
`;

/* ------------------------------------------------------------- geometry --
   Pure. Given puzzle JSON, produce every derived structure the UI needs.
   Nothing here knows that a screen exists.                                  */

const BLOCK_CHARS = new Set([".", "#", " "]);

export function parsePuzzle(p) {
  const errors = [];
  const gridSrc = Array.isArray(p?.grid) ? p.grid : [];
  const rows = p?.size?.rows ?? gridSrc.length;
  const cols = p?.size?.cols ?? gridSrc.reduce((m, r) => Math.max(m, String(r).length), 0);
  const minLen = p?.minEntryLength ?? 2;

  if (!rows || !cols) errors.push("Grid is empty. Add rows to `grid`.");

  // solution[r][c] = uppercase letter, or null for a block
  const solution = [];
  for (let r = 0; r < rows; r++) {
    const src = String(gridSrc[r] ?? "").toUpperCase();
    if (gridSrc[r] != null && src.length !== cols) {
      errors.push(`Row ${r} has ${src.length} cells, expected ${cols}.`);
    }
    const row = [];
    for (let c = 0; c < cols; c++) {
      const ch = src[c] ?? ".";
      row.push(BLOCK_CHARS.has(ch) ? null : ch);
    }
    solution.push(row);
  }

  const isOpen = (r, c) =>
    r >= 0 && r < rows && c >= 0 && c < cols && solution[r][c] !== null;

  // Maximal runs of length >= minLen. Runs shorter than minLen are legal
  // cells but are not entries — the cell is simply unchecked in that
  // direction. This is what makes minEntryLength=2 (minis) and =3
  // (standard) the same code path.
  const collect = (dir) => {
    const out = [];
    const outer = dir === "across" ? rows : cols;
    const inner = dir === "across" ? cols : rows;
    for (let a = 0; a < outer; a++) {
      let b = 0;
      while (b < inner) {
        const at = (k) => (dir === "across" ? isOpen(a, k) : isOpen(k, a));
        if (!at(b)) { b++; continue; }
        const start = b;
        while (b < inner && at(b)) b++;
        const len = b - start;
        if (len >= minLen) {
          out.push({
            dir,
            row: dir === "across" ? a : start,
            col: dir === "across" ? start : a,
            len,
          });
        }
      }
    }
    return out;
  };

  const runs = [...collect("across"), ...collect("down")];

  // Numbering: row-major scan; a cell earns the next number if any run
  // starts there. Standard crossword convention.
  const startsAt = new Set(runs.map((e) => `${e.row},${e.col}`));
  const numberAt = new Map();
  let n = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (startsAt.has(`${r},${c}`)) numberAt.set(`${r},${c}`, n++);
    }
  }

  const entries = runs.map((e) => {
    const number = numberAt.get(`${e.row},${e.col}`);
    const cells = [];
    for (let i = 0; i < e.len; i++) {
      cells.push(
        e.dir === "across"
          ? { r: e.row, c: e.col + i }
          : { r: e.row + i, c: e.col }
      );
    }
    const answer = cells.map(({ r, c }) => solution[r][c]).join("");
    const clue = p?.clues?.[e.dir]?.[String(number)];
    if (clue == null) errors.push(`Missing clue: ${number}${e.dir === "across" ? "A" : "D"} (${answer}).`);
    return { ...e, number, cells, answer, clue: clue ?? "—", id: `${number}${e.dir[0].toUpperCase()}` };
  });

  // Direction first, then number: 1A 4A 5A 6A 7A, then 1D 2D 3D 4D 5D.
  // Stepping therefore runs 2A -> 3A within a direction and only crosses
  // into the down clues at the end of the across list.
  entries.sort((a, b) =>
    (a.dir === b.dir ? 0 : a.dir === "across" ? -1 : 1) || (a.number - b.number)
  );

  // Report clue keys the grid does not produce — the usual authoring slip.
  for (const dir of ["across", "down"]) {
    const given = Object.keys(p?.clues?.[dir] ?? {});
    const real = new Set(entries.filter((e) => e.dir === dir).map((e) => String(e.number)));
    for (const k of given) {
      if (!real.has(k)) errors.push(`Clue ${k}${dir === "across" ? "A" : "D"} has no entry in the grid.`);
    }
  }

  // cellIndex[r][c] = { across: entryIdx|null, down: entryIdx|null, number }
  const cellIndex = solution.map((row) => row.map(() => null));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isOpen(r, c)) continue;
      cellIndex[r][c] = { across: null, down: null, number: numberAt.get(`${r},${c}`) ?? null };
    }
  }
  entries.forEach((e, i) => {
    for (const { r, c } of e.cells) cellIndex[r][c][e.dir] = i;
  });

  const openCells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (isOpen(r, c)) openCells.push({ r, c });

  return { rows, cols, minLen, solution, entries, cellIndex, openCells, errors, isOpen,
           title: p?.title ?? "Untitled", author: p?.author ?? null };
}

/* ---------------------------------------------------------- play state --
   Cursor, letters, check results, navigation. Still no DOM.                */

function usePuzzle(json) {
  const model = useMemo(() => parsePuzzle(json), [json]);

  const first = model.openCells[0] ?? { r: 0, c: 0 };
  const [cursor, setCursor] = useState({ r: first.r, c: first.c, dir: "across" });
  const [letters, setLetters] = useState({});   // "r,c" -> "A"
  const [wrong, setWrong] = useState(null);     // Set of "r,c" after a check
  const [solved, setSolved] = useState(false);

  const entryIdx = (() => {
    const ci = model.cellIndex?.[cursor.r]?.[cursor.c];
    if (!ci) return null;
    return ci[cursor.dir] ?? ci[cursor.dir === "across" ? "down" : "across"];
  })();
  const entry = entryIdx == null ? null : model.entries[entryIdx];

  const filled = model.openCells.length > 0 &&
    model.openCells.every(({ r, c }) => letters[`${r},${c}`]);

  const clearMarks = useCallback(() => { setWrong(null); setSolved(false); }, []);

  const focusCell = useCallback((r, c, preferDir) => {
    const ci = model.cellIndex?.[r]?.[c];
    if (!ci) return;
    setCursor((cur) => {
      const want = preferDir ?? cur.dir;
      const dir = ci[want] != null ? want : (ci.across != null ? "across" : "down");
      return { r, c, dir };
    });
  }, [model]);

  const tapCell = useCallback((r, c) => {
    const ci = model.cellIndex?.[r]?.[c];
    if (!ci) return;
    setCursor((cur) => {
      if (cur.r === r && cur.c === c) {
        const flip = cur.dir === "across" ? "down" : "across";
        return ci[flip] != null ? { r, c, dir: flip } : cur;
      }
      const dir = ci[cur.dir] != null ? cur.dir : (ci.across != null ? "across" : "down");
      return { r, c, dir };
    });
  }, [model]);

  // requireEmpty: used when auto-advancing after filling an entry, so the
  // cursor skips words that are already complete. The clue-bar arrows leave
  // it off, so manual navigation still visits every clue.
  const stepEntry = useCallback((delta, requireEmpty = false) => {
    const list = model.entries;
    const n = list.length;
    if (!n) return;
    const start = entryIdx == null ? 0 : entryIdx;
    const at = (k) => list[(((start + delta * k) % n) + n) % n];

    for (let k = 1; k <= n; k++) {
      const next = at(k);
      const empty = next.cells.find(({ r, c }) => !letters[`${r},${c}`]);
      if (requireEmpty && !empty) continue;
      const target = empty ?? next.cells[0];
      setCursor({ r: target.r, c: target.c, dir: next.dir });
      return;
    }
    // Every entry is full — land on the immediate neighbour anyway.
    const next = at(1);
    setCursor({ r: next.cells[0].r, c: next.cells[0].c, dir: next.dir });
  }, [model, entryIdx, letters]);

  const advance = useCallback(() => {
    if (!entry) return;
    const pos = entry.cells.findIndex((x) => x.r === cursor.r && x.c === cursor.c);
    const rest = entry.cells.slice(pos + 1);
    const nextEmpty = rest.find(({ r, c }) => !letters[`${r},${c}`]);
    if (nextEmpty) return setCursor({ ...nextEmpty, dir: entry.dir });
    if (rest.length) return setCursor({ ...rest[rest.length - 1], dir: entry.dir });
    stepEntry(1, true);
  }, [entry, cursor, letters, stepEntry]);

  const type = useCallback((ch) => {
    if (!model.cellIndex?.[cursor.r]?.[cursor.c]) return;
    clearMarks();
    setLetters((L) => ({ ...L, [`${cursor.r},${cursor.c}`]: ch }));
    advance();
  }, [cursor, advance, model, clearMarks]);

  const backspace = useCallback(() => {
    clearMarks();
    const key = `${cursor.r},${cursor.c}`;
    if (letters[key]) {
      setLetters((L) => { const n = { ...L }; delete n[key]; return n; });
      return;
    }
    if (!entry) return;
    const pos = entry.cells.findIndex((x) => x.r === cursor.r && x.c === cursor.c);
    const prev = entry.cells[pos - 1];
    if (!prev) return;
    setLetters((L) => { const n = { ...L }; delete n[`${prev.r},${prev.c}`]; return n; });
    setCursor({ ...prev, dir: entry.dir });
  }, [cursor, entry, letters, clearMarks]);

  // v1's only checking affordance: whole puzzle, once every square is filled.
  const checkAll = useCallback(() => {
    const bad = new Set();
    for (const { r, c } of model.openCells) {
      if (letters[`${r},${c}`] !== model.solution[r][c]) bad.add(`${r},${c}`);
    }
    setWrong(bad);
    setSolved(bad.size === 0);
  }, [model, letters]);

  return { model, cursor, letters, wrong, solved, entry, filled,
           tapCell, focusCell, stepEntry, type, backspace, checkAll,
           toggleDir: () => tapCell(cursor.r, cursor.c) };
}

/* ------------------------------------------------------- app updates --
   The service worker is cache-first, so a new deploy sits in the "waiting"
   state until something tells it to take over. Rather than swapping code
   under a half-solved puzzle, the page surfaces a banner and lets the user
   choose the moment.                                                      */

function useAppUpdate() {
  const [waiting, setWaiting] = useState(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    let reg = null;
    let dead = false;
    let reloading = false;

    // On a first-ever visit there is no controller; the worker claiming the
    // page then is normal startup, not an update, and must not reload.
    const hadController = !!sw.controller;

    const watch = (worker) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && sw.controller) setWaiting(worker);
      });
    };

    sw.getRegistration().then((r) => {
      if (!r || dead) return;
      reg = r;
      if (r.waiting && sw.controller) setWaiting(r.waiting);
      watch(r.installing);
      r.addEventListener("updatefound", () => watch(r.installing));
    });

    const onController = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    sw.addEventListener("controllerchange", onController);

    // Re-check when the app comes back to the foreground, so a long-lived
    // installed copy still notices deploys.
    const recheck = () => { if (reg) reg.update().catch(() => {}); };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);

    return () => {
      dead = true;
      sw.removeEventListener("controllerchange", onController);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
  }, [waiting]);

  return { updateReady: !!waiting, applyUpdate };
}

/* ------------------------------------------------------------- renderer --
   The swap point. A Three.js version implements this same prop contract:
   ({ model, cursor, letters, wrong, solved, onCellTap }) => node            */

function GridDOM({ model, cursor, letters, wrong, solved, celebrating, onCellTap }) {
  const activeIdx = model.cellIndex?.[cursor.r]?.[cursor.c]?.[cursor.dir];

  // Selection commits on pointer-UP, and only if the finger stayed put.
  // Committing on pointerdown meant any gesture that began on a cell — a
  // scroll, a stray drag — moved the cursor before it could be recognised
  // as something other than a tap. Slop is a fraction of the viewport, not
  // a pixel count, so it holds at any density.
  const down = useRef(null);
  const slop = () =>
    Math.min(window.innerWidth || 400, window.innerHeight || 700) * 0.022;

  // --cols / --rows are puzzle data, not layout constants. Everything
  // geometric is derived from them in CSS against the stage's container
  // size, so the grid fits any viewport with no JS measurement at all.
  return (
    <div
      className={"xw-gridwrap" + (solved ? " solved" : "")}
      style={{ "--cols": model.cols, "--rows": model.rows }}
    >
      {celebrating && <div className="xw-solve">SOLVED</div>}
      {model.solution.map((row, r) =>
        row.map((sol, c) => {
          if (sol === null) return <div key={`${r},${c}`} className="xw-cell block" />;
          const ci = model.cellIndex[r][c];
          const isCursor = cursor.r === r && cursor.c === c;
          const inWord = activeIdx != null && ci[cursor.dir] === activeIdx;
          const isWrong = wrong?.has(`${r},${c}`);
          const cls = ["xw-cell",
            isWrong ? "wrong" : isCursor ? "cursor" : inWord ? "inword" : ""].join(" ");
          return (
            <div
              key={`${r},${c}`}
              className={cls}
              /* preventDefault stops the browser's own mousedown focus
                 handling from immediately blurring the hidden input. */
              onPointerDown={(e) => {
                e.preventDefault();
                down.current = { x: e.clientX, y: e.clientY, r, c };
              }}
              onPointerUp={(e) => {
                const d = down.current;
                down.current = null;
                if (!d || d.r !== r || d.c !== c) return;
                if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > slop()) return;
                onCellTap(r, c);
              }}
              onPointerCancel={() => { down.current = null; }}
              /* WebKit does not reliably suppress compatibility mouse events
                 when pointerdown is defaulted, and a stray mousedown lands
                 after we have focused — blurring it, which is the flash of
                 keyboard that vanishes. Refuse it here too. */
              onMouseDown={(e) => e.preventDefault()}
            >
              {ci.number != null && <span className="xw-num">{ci.number}</span>}
              {letters[`${r},${c}`] ?? ""}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ UI -- */

function ClueBar({ entry, onPrev, onNext, onToggle }) {
  if (!entry) return null;
  return (
    <div className="xw-cluebar">
      <button className="xw-clue" onClick={onToggle}>
        <div className="xw-cluetop">
          <span>Clue {entry.id}</span>
        </div>
        <div className="xw-cluetext">{entry.clue}</div>
      </button>
      <div className="xw-nav">
        <button className="xw-arrow" onClick={onPrev} aria-label="Previous clue">‹</button>
        <button className="xw-arrow" onClick={onNext} aria-label="Next clue">›</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- sample --
   The default puzzle: a 5x5 mini with a rotationally symmetric block
   pattern. Only the sample is fixed at 5x5 — the renderer still takes rows,
   cols and minEntryLength from the puzzle, so any size loads via the
   `puzzle` prop or a share link without a code change.                     */

const SAMPLE_MINI = {
  schemaVersion: 1,
  id: "mini-001",
  title: "Mini 001",
  author: "—",
  size: { rows: 5, cols: 5 },
  minEntryLength: 2,
  grid: [
    "..RHO",
    ".SEAL",
    "SCARE",
    "PACE.",
    "ART..",
  ],
  clues: {
    across: {
      "1": "Greek letter after pi",
      "4": "Barking shore mammal",
      "5": "Give a fright",
      "6": "Steps per minute, to a runner",
      "7": "What a gallery hangs",
    },
    down: {
      "1": "Respond",
      "2": "Tortoise's rival",
      "3": "Bullring shout",
      "4": "Mark a wound leaves",
      "5": "Massage destination",
    },
  },
};

/* ------------------------------------------------------------------ app -- */

export default function CrosswordPlayer({ puzzle, onExit }) {
  const [toast, setToast] = useState(null);
  const [kbdOn, setKbdOn] = useState(false);
  const inputRef = useRef(null);

  const [linked] = useState(() =>
    typeof window === "undefined" ? null : puzzleFromLocation()
  );

  const source = linked ?? puzzle ?? SAMPLE_MINI;

  const P = usePuzzle(source);
  const { model } = P;
  const { updateReady, applyUpdate } = useAppUpdate();

  // The stamp plays once per solve. Anyone who has asked for reduced motion
  // skips straight to the persistent mark.
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (!P.solved) { setCelebrating(false); return; }
    // Inline rather than calling blurInput(): this effect is declared above
    // that useCallback, so naming it here would hit the temporal dead zone.
    inputRef.current?.blur();
    setKbdOn(false);
    const still = typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) return;
    setCelebrating(true);
    const t = setTimeout(() => setCelebrating(false), 1500);
    return () => clearTimeout(t);
  }, [P.solved]);

  /* --- keyboard: the real one -------------------------------------------
     iOS only raises its keyboard for a focused editable element, so a
     hidden input stands in for one. Characters arrive as input events
     rather than keydown, because iOS software keyboards report
     key: "Unidentified" on keydown and can't be read that way.          */

  const SENTINEL = "\u00a0";

  const focusInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.value = SENTINEL;
    // iOS can dismiss the keyboard while leaving the input focused. In that
    // state focus() does nothing at all — the element is already active — so
    // the keyboard never returns and tapping cells appears dead. Forcing a
    // blur/focus transition is what revives it.
    if (document.activeElement === el && kbInsetRef.current === 0) el.blur();
    el.focus({ preventScroll: true });
    setKbdOn(true);
  }, []);

  const blurInput = useCallback(() => {
    inputRef.current?.blur();
    setKbdOn(false);
  }, []);

  // Toggling reads the DOM rather than React state. The button's own tap
  // blurs the input before click fires, so any captured `kbdOn` is already
  // one render stale by then — which is why the old Hide button dismissed
  // the keyboard and immediately reopened it.
  const toggleKeyboard = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const focused = document.activeElement === el;
    // On touch devices "up" means a keyboard is actually covering screen —
    // focus alone is not enough, because it can outlive the keyboard. On a
    // desktop there is no software keyboard, so focus is all there is.
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    const up = coarse ? focused && kbInsetRef.current > 0 : focused;
    if (up) blurInput();
    else focusInput();
  }, [blurInput, focusInput]);

  const onInput = useCallback((e) => {
    const el = e.target;
    const v = el.value;
    if (v.length > SENTINEL.length) {
      for (const ch of v.slice(SENTINEL.length)) {
        if (/[a-zA-Z]/.test(ch)) P.type(ch.toUpperCase());
        else if (ch === " ") P.toggleDir();
      }
    } else if (v.length < SENTINEL.length) {
      P.backspace();
    }
    // Restore the sentinel so there is always something for the next
    // backspace to delete — otherwise iOS stops emitting delete events.
    el.value = SENTINEL;
  }, [P]);

  // Tapping a cell moves the cursor and nothing else. The keyboard is raised
  // deliberately, via the toggle. Cells still refuse pointerdown/mousedown,
  // so moving around the board while typing does not drop focus and the
  // keyboard stays up.
  const tapCell = P.tapCell;

  /* --- keyboard inset ----------------------------------------------------
     How much of the layout viewport the keyboard currently covers. The
     layout viewport (window.innerHeight) does not change when the keyboard
     opens; only the visual viewport shrinks. The difference is the inset. */

  const [kbInset, setKbInset] = useState(0);
  // Callbacks need the current inset without waiting for a re-render.
  const kbInsetRef = useRef(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" && window.visualViewport;
    if (!vv) return;
    const sync = () => {
      // offsetTop is deliberately excluded. It becomes non-zero while iOS
      // pans the visual viewport, and folding it in made the dock drift
      // mid-gesture. Keyboard height is innerHeight - vv.height regardless
      // of where the user has panned to.
      const covered = window.innerHeight - vv.height;
      // A software keyboard always claims a large share of the screen; a
      // collapsing URL bar claims a small one. Discriminating by proportion
      // rather than a pixel count holds on any display.
      const isKeyboard = covered > window.innerHeight * 0.15;
      kbInsetRef.current = isKeyboard ? covered : 0;
      setKbInset(kbInsetRef.current);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Is the keyboard actually on screen? --kb is ground truth (however it
  // was dismissed, the visual viewport grows back), with focus as an
  // optimistic signal so the label flips on tap rather than after the
  // keyboard finishes animating.
  const kbVisible = kbInset > 0 || kbdOn;

  // kbdOn is optimistic so the label flips on tap rather than after the
  // keyboard animates. If no keyboard ever arrives — it was dismissed
  // without blurring, or the focus did not take — stop claiming it is up,
  // which is what left the button stuck reading "Hide".
  useEffect(() => {
    if (!kbdOn || kbInset > 0) return;
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    const t = setTimeout(() => {
      if (kbInsetRef.current === 0) setKbdOn(false);
    }, 700);
    return () => clearTimeout(t);
  }, [kbdOn, kbInset]);

  const share = useCallback(async () => {
    const { ok, url } = await copyShareUrl(source);
    setToast(ok ? "Link copied. Anyone who opens it gets this puzzle."
                : `Copy failed — the link is ${url.length} characters.`);
  }, [source]);

  // Physical keyboards only. When the hidden input has focus it already
  // handles letters and deletion, so this defers to it to avoid doubling.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Tab") { e.preventDefault(); P.stepEntry(e.shiftKey ? -1 : 1); return; }
      if (typeof document !== "undefined" && document.activeElement === inputRef.current) return;
      if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); P.type(e.key.toUpperCase()); }
      else if (e.key === "Backspace") { e.preventDefault(); P.backspace(); }
      else if (e.key === " ") { e.preventDefault(); P.toggleDir(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [P]);

  return (
    <div
      className={"xw" + (kbInset > 0 ? " typing" : "")}
      style={{ "--kb": `${kbInset}px` }}
    >
      <style>{TOKENS}</style>

      <div className="xw-head">
        {onExit && (
          <button className="xw-hbtn" onClick={onExit} aria-label="Back to puzzle list">‹ Puzzles</button>
        )}
        <span className="xw-title">{model.title}</span>
        <span className="xw-meta">
          {model.rows}×{model.cols}
          <button className="xw-hbtn" onClick={share}>share</button>
        </span>
      </div>

      {toast && <div className="xw-toast">{toast}</div>}

      {model.errors.length > 0 && (
        <div className="xw-errors">
          {model.errors.slice(0, 4).map((e, i) => <div key={i}>! {e}</div>)}
          {model.errors.length > 4 && <div>! …and {model.errors.length - 4} more</div>}
        </div>
      )}

      {/* Tapping the field around the grid dismisses the keyboard. The
          target check keeps this on the stage itself — wrapping the grid in
          an extra element would break its width, since .xw-gridwrap sizes
          against its parent. */}
      <ClueBar
        entry={P.entry}
        onPrev={() => P.stepEntry(-1)}
        onNext={() => P.stepEntry(1)}
        onToggle={P.toggleDir}
      />

      <div
        className="xw-stage"
        onPointerDown={(e) => { if (e.target === e.currentTarget) blurInput(); }}
      >
        <GridDOM
          model={model}
          cursor={P.cursor}
          letters={P.letters}
          wrong={P.wrong}
          solved={P.solved}
          celebrating={celebrating}
          onCellTap={tapCell}
        />
        {P.solved && !celebrating && (
          <div className="xw-solved-mark">SOLVED</div>
        )}
      </div>

      <input
        ref={inputRef}
        className="xw-input"
        type="text"
        defaultValue={SENTINEL}
        onInput={onInput}
        onBlur={() => setKbdOn(false)}
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="Type letters"
        tabIndex={-1}
      />

      <div className="xw-dock">
      {updateReady && (
        <div className="xw-update">
          <span>A new version is ready.</span>
          <button onClick={applyUpdate}>Reload</button>
        </div>
      )}

      <div className="xw-action">
        {P.solved ? (
          <div className="xw-banner">Solved. Every square checks out.</div>
        ) : (
          <>
            {/* Stacked above the controls, never in place of them — swapping
                it in used to take the keyboard toggle away with it, leaving
                no way to fix anything. */}
            {P.wrong && P.wrong.size > 0 && (
              <div className="xw-banner bad">
                {P.wrong.size === 1
                  ? "1 square is wrong. Fix it and check again."
                  : `${P.wrong.size} squares are wrong. Fix them and check again.`}
              </div>
            )}
          <div className="xw-actionrow">
            <button className="xw-btn" disabled={!P.filled} onClick={P.checkAll}>
              {P.filled ? "Check puzzle" : "Fill every square to check answers"}
            </button>
            <button
              className="xw-btn kbd"
              /* pointerDown + preventDefault keeps the tap from stealing
                 focus, so the toggle acts on a stable state. */
              onPointerDown={(e) => { e.preventDefault(); toggleKeyboard(); }}
              aria-label={kbVisible ? "Hide keyboard" : "Show keyboard"}
            >
              {kbVisible ? "Hide" : "Keyboard"}
            </button>
          </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
