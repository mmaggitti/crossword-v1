/* Clue hygiene — the gate.
 *
 * Walks every shipped puzzle AND clue-bank.json and refuses to let a clue that
 * gives away its own answer sit in the repo. The rule, and the measurements that
 * shaped it, live in ../clue-rules.mjs — the same module gen-minis3.mjs guards
 * with, so the generator and this test cannot drift apart.
 *
 * Why it validates the emitted JSON rather than trusting the generator: the 5x5
 * minis/ set — which is where all three original violations shipped from — has
 * no generator in this repo at all (package.json says it comes from
 * ../../mini-crosswords.md, via a script that was never checked in). A
 * generator-side guard cannot protect files nothing in the repo generates.
 *
 * Pure node, no build, no browser: it runs in milliseconds, which is why the
 * root `npm test` puts it first — a bad clue fails the deploy before CI spends
 * two minutes installing Playwright.
 *
 *   node packages/clue-data/test/clue-hygiene-test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkBank, checkPuzzle } from "../clue-rules.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const puzzleFiles = ["minis", "minis3"].flatMap((d) => {
  const dir = path.join(root, d);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(dir, f));
});

const checks = [];
const ok = (name, cond) => checks.push([name, !!cond]);

// --- the puzzles -----------------------------------------------------------
let clueCount = 0;
const puzzleProblems = [];
for (const file of puzzleFiles) {
  const puzzle = JSON.parse(fs.readFileSync(file, "utf8"));
  clueCount += Object.keys(puzzle.clues?.across ?? {}).length
    + Object.keys(puzzle.clues?.down ?? {}).length;
  for (const p of checkPuzzle(puzzle)) {
    puzzleProblems.push({ file: path.basename(file), ...p });
  }
}

const byKind = (kind) => puzzleProblems.filter((p) => p.kind === kind);

console.log(`scanned ${clueCount} clues across ${puzzleFiles.length} puzzles`);
ok("no answer appears inside its own clue", byKind("answer-in-clue").length === 0);
ok("no clue gives away another answer in the same puzzle", byKind("leaks-other-answer").length === 0);
ok("every entry has a clue", byKind("missing-clue").length === 0);
ok("every clue maps to an entry in the grid", byKind("orphan-clue").length === 0);

// --- the bank the puzzles are filled from ----------------------------------
const bank = JSON.parse(fs.readFileSync(path.join(root, "clue-bank.json"), "utf8"));
const bankProblems = checkBank(bank);
console.log(`scanned ${Object.keys(bank).length} clue-bank entries`);
ok("no bank answer appears inside its own clue", bankProblems.length === 0);

// --- report ----------------------------------------------------------------
if (puzzleProblems.length) {
  console.log("\nPUZZLE VIOLATIONS");
  for (const p of puzzleProblems) {
    console.log(`  ${p.file.padEnd(18)} ${p.entry.padEnd(4)} ${p.kind.padEnd(14)} ${p.detail}`);
  }
}
if (bankProblems.length) {
  console.log("\nCLUE-BANK VIOLATIONS  (these are the source: a bad bank entry becomes");
  console.log("a bad puzzle the moment a grid uses that answer)");
  for (const b of bankProblems) {
    console.log(`  ${b.answer.padEnd(10)} <- "${b.clue}"   (inside "${b.word}")`);
  }
}
if (puzzleProblems.length || bankProblems.length) {
  console.log("\nRewrite the clue so the answer does not appear in it. The rule and the");
  console.log("reasoning are in packages/clue-data/clue-rules.mjs.");
}

const bad = checks.filter(([, pass]) => !pass);
console.log();
for (const [name, pass] of checks) console.log(`${pass ? "ok   " : "FAIL "}${name}`);
console.log(bad.length ? `\n${bad.length} clue-hygiene checks failed.` : "\nClue hygiene holds.");
process.exit(bad.length ? 1 : 0);
