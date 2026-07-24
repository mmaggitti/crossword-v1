// Generate the 3x3 minis — a smaller, easier companion to the 5x5 set.
//
// Each is a fully-interlocked 3x3 word square (3 across + 3 down, all 3-letter
// words, no black squares), drawn from clue-bank.json so every one of the six
// slots comes with a real hand-written clue. Words are globally unique across
// the set, and each 3x3 borrows the title of the 5x5 mini at the same index so
// the in-game size toggle reads as "the 3x3 version of this puzzle".
//
//   node packages/clue-data/gen-minis3.mjs   ->  packages/clue-data/minis3/*.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bank = JSON.parse(fs.readFileSync(path.join(here, "clue-bank.json"), "utf8"));

const words = Object.keys(bank).filter((w) => /^[A-Z]{3}$/.test(w));
const wset = new Set(words);
const pref = new Set();
for (const w of words) for (let i = 1; i <= 3; i++) pref.add(w.slice(0, i));

// Titles mirror the 5x5 minis (packages/clue-data/index.js order).
const TITLES = [
  "Warm-Up", "Fair Trade", "Common Ground", "Rush Hour", "Small Talk",
  "Word Bank", "Night Owl", "Open House", "Ground Floor", "Home Stretch",
];

// Deterministic shuffle so the output is stable across runs.
let seed = 20260724;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const order = words.slice();
for (let i = order.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}

// Whole-square signatures already emitted, so every puzzle is distinct. Words
// may recur ACROSS puzzles (the 290-word clue bank is too small to fill ten
// fully word-disjoint 3x3s), but each puzzle is internally all-distinct.
const seen = new Set();

// One non-symmetric double square (rows and columns all distinct words) that
// hasn't been emitted yet.
function findSquare() {
  const rows = [];
  let found = null;
  const rec = () => {
    if (found) return;
    if (rows.length === 3) {
      const cols = [0, 1, 2].map((c) => rows.map((r) => r[c]).join(""));
      if (!cols.every((c) => wset.has(c))) return;
      const all = [...rows, ...cols];
      if (new Set(all).size !== 6) return;              // 6 distinct words in-puzzle
      const sig = rows.join("|");
      if (seen.has(sig)) return;                        // not already emitted
      found = { rows: rows.slice(), cols, sig };
      return;
    }
    for (const w of order) {
      let ok = true;
      for (let c = 0; c < 3; c++) {
        if (!pref.has(rows.map((r) => r[c]).join("") + w[c])) { ok = false; break; }
      }
      if (ok) { rows.push(w); rec(); rows.pop(); if (found) return; }
    }
  };
  rec();
  return found;
}

const dir = path.join(here, "minis3");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const made = [];
for (let i = 0; i < 10; i++) {
  const sq = findSquare();
  if (!sq) break;
  seen.add(sq.sig);
  const [r0, r1, r2] = sq.rows;
  const [c0, c1, c2] = sq.cols;

  // Numbering for a blockless 3x3 is fixed: 1@(0,0) 2@(0,1) 3@(0,2) 4@(1,0) 5@(2,0).
  const puzzle = {
    schemaVersion: 1,
    id: `mini3-${String(i + 1).padStart(3, "0")}`,
    title: TITLES[i] ?? `Mini 3×3 ${i + 1}`,
    author: "Mark",
    size: { rows: 3, cols: 3 },
    minEntryLength: 3,
    grid: [r0, r1, r2],
    clues: {
      across: { "1": bank[r0], "4": bank[r1], "5": bank[r2] },
      down: { "1": bank[c0], "2": bank[c1], "3": bank[c2] },
    },
  };
  fs.writeFileSync(path.join(dir, `${puzzle.id}.json`), JSON.stringify(puzzle, null, 2) + "\n");
  made.push(puzzle);
}

console.log(`wrote ${made.length} 3x3 minis`);
for (const p of made) {
  console.log(`  ${p.id}  ${p.grid.join(" / ")}  (${p.title})`);
}
