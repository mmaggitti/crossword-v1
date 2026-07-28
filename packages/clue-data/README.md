# @crossword/clue-data

The puzzle content: ten hand-authored 5×5 minis, ten generated 3×3 minis, and the
answer→clue bank they are filled from.

```
minis/mini-0NN.json     5x5 set, schema v1. No generator in this repo — these came
                        from ../../mini-crosswords.md.
minis3/mini3-0NN.json   3x3 set. Generated: `node gen-minis3.mjs` rewrites all ten.
clue-bank.json          1574 entries, a flat { "ANSWER": "Clue" } object. This is
                        the file to append to as the pool grows.
clue-rules.mjs          the content rules, shared by the generator and the test
test/                   the gate
```

## The rules you must not break

**A clue must never contain its own answer — or any other answer in the puzzle.**
Never hand the solver a word they are supposed to work for.

```
BAD    "ROBE": "Bathrobe"          the clue contains the answer
BAD    "ABLE": "Capable"
BAD    "FIRE": "Campfire"

GOOD   "ROBE": "Loose garment"
GOOD   "ABLE": "Competent"
GOOD   "FIRE": "Blaze"
```

The second rule is the same sin one entry over — in mini-005, `BEST` was clued
"Top-**rated**" while `RATE` sat directly below it as 5A:

```
BAD    1A BEST "Top-rated"   ...when 5A is RATE
GOOD   1A BEST "Finest"
```

That one only bites inside a puzzle, so it is checked per-puzzle rather than on the
bank (a bank entry has no neighbours). It matches an answer plus a common inflection
— `rated`, `rates`, `rating` — not any old substring.

This applies to `clue-bank.json` exactly as much as to a puzzle. `gen-minis3.mjs`
copies bank clue text into puzzles verbatim, so a bad bank entry is a puzzle bug
waiting for a grid to use that answer — which is how all three of the original
violations shipped.

Run the check before committing content:

```bash
npm test --workspace @crossword/clue-data
```

It is pure node — no build, no browser, ~0.3s — and it also runs first in the repo's
root `npm test`, which gates the deploy. It reports the file, entry, answer, clue and
the exact word the answer is hiding in.

The rule's precise shape (word-wise, own-clue-only, no minimum answer length) and the
measurements behind it are documented at the top of `clue-rules.mjs`. Looser variants
were tried and rejected because they flagged perfectly good clues — read that comment
before changing the predicate.

## Appending to the bank

Keep it alphabetical by answer, one entry per line, and give each answer a clue that
would stand on its own in a beginner mini: plain, unambiguous, no wordplay needed.
Prefer a clue that is *not* already used for a different answer — the check does not
enforce uniqueness, but two answers sharing one clue makes both worse.

## Regenerating the 3×3 set

```bash
node gen-minis3.mjs      # rewrites every minis3/*.json
```

Deterministic — same bank in, same ten puzzles out — so a clean run leaves
`git diff` empty. It refuses to emit a puzzle that breaks the rule: the word-square
search backtracks past any answer whose bank clue contains it, and a final assert
throws before writing. Regenerate only when the bank changes in a way that should
reshape the set; a routine bank fix usually needs no regeneration at all.
