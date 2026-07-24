# Word Squares — no-black-square 5×5 puzzles, scored on a commonness spectrum

## Context

Mark wants a 5×5 crossword where **every row and every column is a 5-letter word and there are no
black squares** — full interlock, 10 distinct words (explicitly *not* the symmetric 5-word kind,
which is less interesting to solve).

**Feasibility was measured before planning, and it's settled:**
- 8,506 five-letter words in the plain dictionary; **24,835** distinct five-letter answers used in
  real crosswords (xd corpus), ~10k used ≥20× and ~5,251 used ≥100×; **median 6 real clues each**.
- 10-distinct squares are abundant: **109,806** of them across only 10 common starting words
  (PLANT alone anchors 11,710). Existence is not the constraint.
- Real constructors almost never do this: exactly **1** blockless 5×5 word square in **89,194**
  published puzzles — so this is a distinctive puzzle type.
- **The real constraint is word quality**, and it's measured: the raw dictionary yields 100k+
  squares but full of obscure fill; Mark's clean 666-word bank yields only **23 squares, all
  symmetric, zero 10-distinct**. The fix is a bigger, *frequency-scored* bank.

**The design Mark chose:** don't pick one quality bar. Gather **all** commonness tiers and rank
squares on a **spectrum by the average commonness of their 10 words** — that average becomes an
adjustable difficulty lever. And drive clue display by **rarity**: everyday words get **no clue**
(you should know them); rarer words (SAT / spelling-bee tier) **do** get a clue. Ships as a
**separate "Word Squares" set**, signposted apart from the existing blocked minis. Longer term the
same mechanic is a vocabulary teacher (Mark is considering foreign-language vocab on this rail).

**Key architectural call:** puzzle data carries *everything* — all 10 clues plus a per-word
commonness score — and the **app applies the rarity threshold at display time**. The lever is then a
runtime setting Mark can slide, not something baked in that would require regenerating puzzles.

## Approach

### Phase 1 — Scored 5-letter word bank
Build `packages/clue-data/word-bank-5.json`, one entry per word:
`{ "WORD": { "freq": <xd usage count>, "score": <0–100 commonness>, "tier": "everyday|common|uncommon|rare|obscure", "clues": [ … ] } }`
- Source frequency + clues by **streaming `_collateral/xd-clues.zip`** (`unzip -p … | python`, never
  extract — it's 268 MB uncompressed). Filter answers to `^[A-Z]{5}$`; **drop the `XXXXX`
  placeholder** (it ranks 4th and is not a word) and screen other degenerate strings.
- `score` = percentile of log-frequency, so it's a smooth 0–100 spectrum rather than hard buckets;
  `tier` is a readable banding on top of it.
- Prefer **Mark's own clue** when the word is in `packages/clue-data/clue-bank.json` (666 hand-clued
  answers); otherwise take the best xd clue (shortest/cleanest of the available ones).
- Keep **every** tier — rare words are wanted, they're what the clue mechanic teaches.

### Phase 2 — Generator: open 5×5, 10 distinct
`gen2.py` currently lives only inside `_collateral/clue-bank-and-generator.zip`. Extract it into the
repo as a maintained tool at **`tools/gen/`** (it's the thing we're now editing, so it should be
version-controlled, not zipped).
- It already does the hard part: backtracking DFS with **MRV slot selection, forward checking, and a
  global `used` set** so answers never repeat across puzzles (`solve(pat, used_global, rng, budget)`,
  with `slots_of`, `fully_checked`, `derive`).
- Add the all-open pattern — **a one-line change**: `"open-5x5": [".....", ".....", ".....", ".....", "....."]`.
  `slots_of` then returns exactly 5 across + 5 down length-5 slots and `fully_checked` already passes.
- Point its vocabulary at the new scored bank instead of `bank_all.BANK`.
- **Reject symmetric squares**: require the 5 across + 5 down answers to be **10 distinct words**.
- Generate a large candidate batch (thousands), not a handful.

### Phase 3 — Score and spread
For each square compute `avgScore` (mean commonness of its 10 words — the difficulty rating Mark
asked for) and `minScore` (its rarest word, which is what actually makes a square feel unfair).
Bucket by `avgScore` and **curate a batch that spans the spectrum** — roughly 20–30 puzzles from
"all everyday words" through to "several SAT-tier words" — so the lever has range to act on.

### Phase 4 — Schema + engine
Emit puzzles in the existing v1 shape plus additive, optional metadata (no breaking change; the
existing 10 minis keep working):
```jsonc
{ "schemaVersion": 1, "id": "sq-001", "set": "word-squares",
  "size": {"rows":5,"cols":5}, "minEntryLength": 5,
  "grid": ["CHEAP", …],                      // no "." at all
  "clues": { "across": {…}, "down": {…} },   // ALL 10 present
  "wordMeta": { "1A": {"score":82,"tier":"everyday"}, … },
  "difficulty": { "avgScore": 74, "minScore": 41 } }
```
- `parsePuzzle` (`packages/core/src/CrosswordPlayer.jsx:464`) needs no change to *render* these — a
  blockless grid is already valid geometry. Verify `minEntryLength: 5` and the numbering derivation
  behave on an all-open grid, and that `wordMeta`/`difficulty` pass through untouched.
- **Clue-visibility lever (the new behavior):** the player shows a clue only when the entry's
  `score` is below the current threshold. Above it, the clue is withheld and the pill reads as
  unclued (e.g. just "5-Across"). Default the threshold mid-spectrum; expose it as a control.

### Phase 5 — Ship as a separate set
- Export from `packages/clue-data/index.js` as its own collection (`squares` / `squaresById`)
  alongside `minis`, so it stays a distinct set rather than mixing into the existing minis.
- Give it its own labeled section in `apps/player/src/Picker.jsx` ("Word Squares"), and its own hash
  route in `apps/player/src/App.jsx` (e.g. `#sq-004`), matching the existing `#mini-00N` pattern.
- These are ordinary v1 puzzles, so they also play in the scramble prototype/app with no extra work.

## Critical files
- `_collateral/xd-clues.zip` — frequency + clue source; **stream, never extract** (268 MB).
- `packages/clue-data/clue-bank.json` — 666 hand-clued answers; preferred clue source.
- `_collateral/clue-bank-and-generator.zip` → extract `gen2.py` to **`tools/gen/`** and extend it.
- New: `packages/clue-data/word-bank-5.json`, `packages/clue-data/squares/sq-0NN.json`.
- `packages/clue-data/index.js` — export the new set.
- `packages/core/src/CrosswordPlayer.jsx` — clue-visibility lever; confirm blockless parse.
- `apps/player/src/{Picker.jsx,App.jsx}` — "Word Squares" section + route.

## Deferred (noted, not built)
Foreign-language vocabulary mode — the same rail: swap the word bank and let "clue" mean
translation, with the rarity threshold deciding what gets taught. The scored-bank + runtime-threshold
design above is what keeps this cheap later.

## Verification
1. **Generator:** assert every emitted square has 10 **distinct** words, zero blocks, all words
   present in the scored bank, and that `avgScore`/`minScore` compute correctly. Print the
   difficulty spread of the batch to confirm it spans the spectrum.
2. **Suites:** `npm test` — all 9 Playwright suites stay green (they gate the deploy).
3. **Browser pane:** load a word-square puzzle in the player; confirm a blockless 5×5 renders,
   numbering is right, and the clue lever hides clues for everyday words and shows them for rare
   ones. `read_console_messages {onlyErrors:true}` clean.
4. **iOS Simulator:** play one word square end-to-end on device (typing, auto-advance, check/solve),
   since that's the only place the real keyboard and layout invariants are proven.
5. **Cross-app:** confirm a word-square puzzle also loads in the scramble prototype.
