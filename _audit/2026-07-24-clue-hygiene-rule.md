# Clue hygiene: an answer must never appear inside its own clue

## Context

Mark spotted `ROBE` clued as **"Bathrobe"** — the answer sitting inside its own clue.
That is a cardinal crossword sin: the clue hands the solver the answer. He asked to
fix it, sweep the rest of the corpus, and put the rule into doctrine so it can't
recur.

I audited all 20 puzzles (160 clues) and the 1,574-entry clue bank directly.

**Shipped violations — 3, and one is in the same puzzle he was looking at:**

| File | Entry | Answer | Clue |
|---|---|---|---|
| `minis/mini-001.json` | 4A | `ROBE` | "Bath**robe**" |
| `minis/mini-001.json` | 2D | `ABLE` | "Cap**able**" |
| `minis/mini-007.json` | 4A | `FIRE` | "Camp**fire**" |

**The root cause is upstream.** `clue-bank.json` holds **10 violations of 1,574**, and
`gen-minis3.mjs:92-97` copies bank clue text *verbatim* into generated puzzles. The 3
shipped ones came straight from the bank; the other **7 are latent** — they surface the
moment a puzzle uses that answer:

```
ABLE <- "Capable"    EAR  <- "Ear of corn, or a listener"   FIRE <- "Campfire"
LIVE <- "Be alive"   MALE <- "Not female"                   MAT  <- "Doormat, e.g."
PAD  <- "Notepad"    PRAY <- "Say a prayer"                 ROBE <- "Bathrobe"
TIE  <- "Necktie, or a drawn game"
```

So fixing only the puzzles would leave the leak open. Both layers need fixing, plus a
test — because **there is no clue-writing doctrine anywhere in the repo today**;
`HANDOVER.md:94` explicitly punts ("The app does **not** enforce construction rules").

**Outcome:** zero violations in shipped data, a test that gates the deploy, a generator
that can't emit one, and the rule written where the next agent will actually read it.

---

## The rule (measured, not guessed)

> **An answer must never appear inside any single word of its own clue** (case-insensitive).

Three design points, each settled against the real data rather than by intuition:

1. **Word-wise, not flat-string.** Flattening the clue and substring-testing produces
   false positives across word boundaries — answer `TON` would match "Not one"
   (`notone`). Testing each clue word individually still catches every real case
   (`Bathrobe`, `Capable`, `Campfire`).
2. **Scoped to its own clue only.** I measured the collision base rate for checking an
   answer against *other* clues: **72% of 3-letter, 64% of 4-letter, 50% of 5-letter**
   answers appear inside some other clue's word (`ACE` in "Fire**pl**ace", "Br**ace**let").
   A cross-clue rule is unusable. Scoped to its own clue, the rule fires on exactly 10
   of 1,574 — all genuine.
3. **No minimum answer length.** Violations split 6 four-letter / 4 three-letter; short
   answers do not over-fire once the rule is scoped correctly.

**Deliberately rejected** (both fired on good clues, so they'd train people to ignore
the test): *reverse containment* — a clue word inside the answer — flagged `NONE` ←
"Not one"; *cross-answer leakage* flagged `ICE` ← "Rink surface" and `MENU` ←
"Restaurant list". Record these as tried-and-rejected so nobody re-adds them.

---

## Task 1 — Fix the data (13 edits)

**Files:** `packages/clue-data/clue-bank.json`; `packages/clue-data/minis/mini-001.json`;
`packages/clue-data/minis/mini-007.json`

All ten replacements are verified to pass the rule **and** to not duplicate any existing
bank clue:

| Answer | Was | Becomes |
|---|---|---|
| `ABLE` | Capable | **Competent** |
| `EAR` | Ear of corn, or a listener | **Corn unit, or a listener** |
| `FIRE` | Campfire | **Blaze** |
| `LIVE` | Be alive | **Reside** |
| `MALE` | Not female | **Buck or bull** |
| `MAT` | Doormat, e.g. | **Wrestling surface** |
| `PAD` | Notepad | **Cushion** |
| `PRAY` | Say a prayer | **Worship, in a way** |
| `ROBE` | Bathrobe | **Loose garment** |
| `TIE` | Necktie, or a drawn game | **Even score, or neckwear** |

- [ ] Apply all ten to `clue-bank.json`.
- [ ] Apply the three that ship, using the **same text as the fixed bank** so puzzle and
  bank stay consistent (the puzzles were filled from the bank): `mini-001` 2D →
  "Competent", 4A → "Loose garment"; `mini-007` 4A → "Blaze". Verified against both
  grids — no clash with the other clues in either puzzle.
- [ ] **Do not regenerate `minis3/`.** Verified: no 3×3 puzzle uses any of the ten
  answers, so the bank fix needs no regeneration. (`gen-minis3.mjs:72` does an
  `fs.rmSync` + full rebuild — running it would needlessly reshuffle all ten puzzles.)
- [ ] `PAD` → "Cushion" rather than "Writing tablet": the bank already clues `PILL` as
  "Tablet", and two near-identical clues for different answers is its own small sin.
- [ ] Note in the commit that `MALE` ← "Not female" is a letter coincidence rather than a
  true give-away, but the rule is absolute so it goes too.

---

## Task 2 — Make it unrepeatable: one predicate, two callers

**Files:** Create `packages/clue-data/clue-rules.mjs`; modify `packages/clue-data/gen-minis3.mjs`

The predicate must live in **one** module that both the generator and the test import, so
the guard and the gate can never drift.

- [ ] `clue-rules.mjs` exports the rule and a corpus walker:
  - `answerInOwnClue(answer, clue)` → the offending clue word, or `null`
  - `entriesOf(puzzle)` → `[{dir, number, answer, clue}]`, deriving numbering from `grid`
  - Document *in the file* why the rule is word-wise and own-clue-only, with the
    72%/64%/50% figures — that comment is what stops a future well-meaning "improvement".
- [ ] **`gen-minis3.mjs` guard, two places** (belt and braces):
  1. In `findSquare()` (~line 44-69), alongside the existing
     `if (new Set(all).size !== 6) return;` distinctness check — reject a square when any
     of its six words is contained in its own bank clue, so the generator *backtracks* to
     a different square and still emits ten puzzles.
  2. A hard throw immediately before `fs.writeFileSync` (~line 97), catching any future
     code path that skips the first check.

**Why the test must validate emitted JSON, not just the generator:** the 5×5 `minis/` —
which hold all three live violations — have **no generator in the repo** (`package.json`
says they come from `mini-crosswords.md` via a script that was never checked in). A
generator-side guard alone cannot protect them.

---

## Task 3 — The test that gates the deploy

**Files:** Create `packages/clue-data/test/clue-hygiene-test.mjs`; modify
`packages/clue-data/package.json` and the root `package.json`

- [ ] The test walks **all 20 puzzle files and `clue-bank.json`** and fails with a table
  of `file / entry / answer / clue / offending word` — the same shape as the audit above,
  so a failure is self-explanatory.
- [ ] Add the two near-free presence invariants while we're here (both **pass on current
  data** — verified, so we're not shipping a test that instantly red-lights): every entry
  has a non-empty clue, and every clue key maps to a real entry. Nothing else — a sprawling
  linter gets ignored; `HANDOVER.md:309` backlog B6 already owns grid-construction rules.
- [ ] Wire it up:
  - `packages/clue-data/package.json` gains `"scripts": { "test": "node test/clue-hygiene-test.mjs" }`.
    No `pretest` — this is pure data, no vite build, no browser.
  - Root `package.json` test becomes
    `npm test --workspace clue-data && npm test --workspace player && npm test --workspace scramble`
    — **clue-data first**, so it fails in milliseconds instead of after CI spends ~2 minutes
    on `playwright install` and two vite builds.
- [ ] `.mjs`, not `.cjs`: the package is `"type": "module"`, and this lets the test import
  the same predicate the generator uses.
- [ ] **Known constraint:** `parsePuzzle` can't be reused — it lives in
  `packages/core/src/CrosswordPlayer.jsx`, a JSX file with React imports that bare node
  can't load. `entriesOf()` re-derives numbering in ~15 lines, exactly the precedent
  `apps/scramble/test/mechanics-test.cjs:8-9` documents for the same reason.

---

## Task 4 — Put it in the doctrine

The rule has to land where an agent reads it *without being told to*.

- [ ] **Create `10 output/crossword-game/CLAUDE.md`** — the primary home. It is the only
  surface auto-loaded when working in this repo, and per-project `CLAUDE.md` is already an
  established vault pattern (five other work folders have one; crossword-game just hasn't
  adopted it). Write the rule in the house **`## Doctrine`** format used by
  `_tools/prompts/*-fieldguide.md`: numbered, bolded lede, each rule carrying its *reason*
  and its *enforcement mechanism*. Lead with the clue rule; point at
  `packages/clue-data/test/clue-hygiene-test.mjs` as the thing that actually enforces it.
- [ ] **Create `packages/clue-data/README.md`** — the file someone appending to the bank
  would look for (`mini-crosswords.md:847` sends them there). State the rule as an
  authoring instruction, next to the bank format.
- [ ] **`HANDOVER.md` §4** — add the rule with its rationale beside the existing
  `HANDOVER.md:94` caveat, so a reader sees that clue *content* is now enforced even though
  grid *construction* still isn't.
- [ ] Not vault-root `CLAUDE.md` (its scope is folder taxonomy across 60+ folders), not
  `_tools/prompts/` (those are reusable cross-project machinery), not `_audit/` (append-only
  history, never edited).

---

## Verification

1. **The audit reruns clean.** Re-run the same scan used to find the problem: expect
   **0 violations** across 160 clues and 1,574 bank entries.
2. **The test actually fails on the bug.** Temporarily revert one clue to "Bathrobe",
   confirm `npm test --workspace clue-data` exits non-zero and names
   `mini-001 4A ROBE`, then restore. A gate never seen red is not known to work.
3. **The generator guard fires.** Temporarily reintroduce a bad bank entry for an answer
   the 3×3 filler uses, run `node gen-minis3.mjs`, confirm it either backtracks or throws
   rather than emitting a bad puzzle. Restore, regenerate, and confirm `git diff` on
   `minis3/` is **empty** — proof the guard is inert on clean data.
4. **Root gate + deploy.** `npm test` at the repo root passes all suites in order
   (clue-data → 10 player → 3 scramble). Push, watch Actions, confirm the deploy is
   still gated and green.
5. **On device.** Open `mini-001` on the iOS Simulator and read 4A/2D — "Loose garment"
   and "Competent", no answer visible in either clue.

## Critical files

- `packages/clue-data/clue-bank.json` — 10 entries (the root cause)
- `packages/clue-data/minis/mini-001.json`, `minis/mini-007.json` — the 3 shipped clues
- `packages/clue-data/clue-rules.mjs` (new) — the single shared predicate
- `packages/clue-data/gen-minis3.mjs` — guard in `findSquare()` + assert before write
- `packages/clue-data/test/clue-hygiene-test.mjs` (new), `packages/clue-data/package.json`,
  root `package.json` — the gate
- `10 output/crossword-game/CLAUDE.md` (new), `packages/clue-data/README.md` (new),
  `HANDOVER.md` — the doctrine
