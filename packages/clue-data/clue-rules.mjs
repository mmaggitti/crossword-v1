/* Clue hygiene — the rules the puzzle content must satisfy.
 *
 * ONE module, TWO callers: the generator (gen-minis3.mjs) refuses to emit a
 * puzzle that breaks these, and the test (test/clue-hygiene-test.mjs) refuses to
 * let one sit in the repo. Keeping the predicate in a single place is the point
 * — a guard and a gate that can drift are worse than either alone.
 *
 * THE RULE
 *
 *   An answer must never appear inside any single word of its own clue.
 *
 * It got here the hard way: ROBE shipped clued as "Bathrobe", which hands the
 * solver the answer. A sweep found three live cases (ROBE/"Bathrobe",
 * ABLE/"Capable", FIRE/"Campfire") and ten in clue-bank.json.
 *
 * WHY IT IS SHAPED EXACTLY THIS WAY — three decisions, each measured against the
 * real corpus rather than guessed. Do not "improve" any of them without redoing
 * the measurement; each looser variant was tried and rejected because it fired
 * on perfectly good clues, and a test that cries wolf is a test people learn to
 * skip.
 *
 *   1. Word-wise, not flat-string. Stripping the spaces out of a clue and
 *      substring-testing matches across word boundaries: the answer TON would
 *      "match" the clue "Not one" (notone). Testing each word on its own still
 *      catches every real case, since those are all compounds — Bathrobe,
 *      Capable, Campfire.
 *
 *   2. Its OWN clue only, never other clues. Checking an answer against the rest
 *      of the corpus is unusable: 72% of 3-letter, 64% of 4-letter and 50% of
 *      5-letter answers in the bank appear inside some other clue's word (ACE
 *      lives in "Fireplace" and "Bracelet"). Scoped to its own clue, the rule
 *      fired on 10 of 1574 — all genuine.
 *
 *   3. No minimum answer length. The violations split 6 four-letter / 4
 *      three-letter, so short answers do not over-fire once (2) is in place.
 *
 * Also rejected: flagging a clue word that sits inside the ANSWER (caught NONE
 * clued "Not one" — a standard clue), and cross-answer leakage (caught ICE
 * clued "Rink surface", MENU clued "Restaurant list" — coincidental letter runs).
 */

const BLOCK = new Set([".", "#", " "]);
const isBlock = (ch) => ch === undefined || BLOCK.has(ch);

/**
 * A clue's words, under BOTH tokenizations:
 *   - split on every non-letter        ("Top-rated" -> top, rated)
 *   - join across hyphens/apostrophes  ("Bath-robe" -> bathrobe)
 * The second closes a real hole: without it, answer BATHROBE clued "Bath-robe"
 * passes clean, and the corpus has 24 hyphenated clues, so it is a live path.
 * Measured over the whole corpus, the union adds zero new hits — pure recall.
 *
 * Deliberately NOT joined across spaces: that is flat-string matching, which
 * would match an answer spanning a word gap (answer TON, clue "Not one").
 */
function clueWords(clue) {
  const s = String(clue);
  const plain = s.match(/[A-Za-z]+/g) ?? [];
  const joined = (s.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).map((w) => w.replace(/[^A-Za-z]/g, ""));
  return [...new Set([...plain, ...joined])].filter(Boolean);
}

/**
 * The rule. Returns the offending clue word, or null when the clue is clean.
 * Case-insensitive; punctuation is not part of a word.
 */
export function answerInOwnClue(answer, clue) {
  if (!answer || !clue) return null;
  const a = String(answer).toLowerCase();
  for (const word of clueWords(clue)) {
    if (word.toLowerCase().includes(a)) return word;
  }
  return null;
}

/* Common English inflections, for the cross-entry rule below. */
const INFLECTIONS = ["", "S", "ES", "D", "ED", "ING", "ER", "ERS", "RS", "R", "Y", "LY", "N"];

/**
 * The SECOND rule: a clue must not hand over a DIFFERENT answer in the same
 * puzzle either. mini-005 clued BEST as "Top-rated" while RATE sat directly
 * below it as 5A — the same sin as ROBE/"Bathrobe", one entry over.
 *
 * This deliberately matches morphologically (another answer, optionally plus a
 * common inflection) rather than by substring. Substring matching was tried and
 * is unusable here: it flagged ICE in "Rink surf-ACE", ANT in "Restaur-ANT",
 * USE in "Ca-USE", NOW in "K-NOW-n" — 7 coincidental letter runs against 1 real
 * leak. The morphological form found exactly the one real case and nothing else.
 *
 * Returns [{ answer, word }] — other answers this clue gives away.
 */
export function crossEntryLeaks(answer, clue, allAnswers) {
  const out = [];
  if (!clue) return out;
  for (const word of clueWords(clue)) {
    const w = word.toUpperCase();
    for (const other of allAnswers) {
      if (other === answer || other.length < 3) continue;
      if (INFLECTIONS.some((suf) => w === other + suf)) out.push({ answer: other, word });
    }
  }
  return out;
}

/**
 * Every across/down entry of a puzzle, as { dir, number, answer, clue }.
 *
 * The schema has no answer list — `grid` holds the solution and the answers are
 * read back off it — so this re-derives standard crossword numbering. It is a
 * deliberate ~20-line duplicate of the numbering inside parsePuzzle
 * (packages/core/src/CrosswordPlayer.jsx): that lives in a .jsx module with React
 * imports which bare node cannot load, and this file has to run under plain node
 * in both the generator and the test. Same reasoning, same trade-off, as the note
 * at apps/scramble/test/mechanics-test.cjs:8.
 */
export function entriesOf(puzzle) {
  const rows = puzzle.size.rows;
  const cols = puzzle.size.cols;
  const grid = puzzle.grid.map((r) => String(r).toUpperCase());
  const at = (r, c) => grid[r]?.[c];
  const blocked = (r, c) => r < 0 || c < 0 || r >= rows || c >= cols || isBlock(at(r, c));

  const out = [];
  let number = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (blocked(r, c)) continue;
      const startsAcross = blocked(r, c - 1) && !blocked(r, c + 1);
      const startsDown = blocked(r - 1, c) && !blocked(r + 1, c);
      if (!startsAcross && !startsDown) continue;
      number++;
      if (startsAcross) {
        let answer = "";
        for (let cc = c; !blocked(r, cc); cc++) answer += at(r, cc);
        out.push({ dir: "across", number, answer, clue: puzzle.clues?.across?.[String(number)] });
      }
      if (startsDown) {
        let answer = "";
        for (let rr = r; !blocked(rr, c); rr++) answer += at(rr, c);
        out.push({ dir: "down", number, answer, clue: puzzle.clues?.down?.[String(number)] });
      }
    }
  }
  return out;
}

/** "4A" / "2D" — how a violation is named in test output and in the app. */
export const label = ({ dir, number }) => `${number}${dir === "across" ? "A" : "D"}`;

/**
 * Every rule violation in one puzzle: the clue rule, plus the two presence
 * invariants (an entry with no clue, and a clue key with no entry). Returns
 * [{ kind, entry, detail }].
 */
export function checkPuzzle(puzzle) {
  const problems = [];
  const entries = entriesOf(puzzle);
  const answers = entries.map((e) => e.answer);

  for (const e of entries) {
    if (!e.clue || !String(e.clue).trim()) {
      problems.push({ kind: "missing-clue", entry: label(e), detail: `${e.answer} has no clue` });
      continue;
    }
    const word = answerInOwnClue(e.answer, e.clue);
    if (word) {
      problems.push({
        kind: "answer-in-clue",
        entry: label(e),
        detail: `${e.answer} <- "${e.clue}"  (inside "${word}")`,
      });
    }
    for (const leak of crossEntryLeaks(e.answer, e.clue, answers)) {
      problems.push({
        kind: "leaks-other-answer",
        entry: label(e),
        detail: `"${e.clue}" gives away ${leak.answer} (via "${leak.word}")`,
      });
    }
  }

  // The other direction: a clue numbered for an entry the grid doesn't have.
  const known = new Set(entries.map((e) => `${e.dir}:${e.number}`));
  for (const dir of ["across", "down"]) {
    for (const number of Object.keys(puzzle.clues?.[dir] ?? {})) {
      if (!known.has(`${dir}:${number}`)) {
        problems.push({
          kind: "orphan-clue",
          entry: `${number}${dir === "across" ? "A" : "D"}`,
          detail: "clue has no entry in the grid",
        });
      }
    }
  }
  return problems;
}

/** Every violation in the answer->clue bank. Returns [{ answer, clue, word }]. */
export function checkBank(bank) {
  const problems = [];
  for (const [answer, clue] of Object.entries(bank)) {
    const word = answerInOwnClue(answer, clue);
    if (word) problems.push({ answer, clue, word });
  }
  return problems;
}
