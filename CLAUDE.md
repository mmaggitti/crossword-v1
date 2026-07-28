# Crossword — project doctrine

A monorepo: a shared engine (`packages/core`), the puzzle content
(`packages/clue-data`), and the apps built on them (`apps/*`), each deployed to its
own URL under `https://mmaggitti.github.io/crossword-v1/`.

Deep reference lives in `HANDOVER.md` (architecture, schema, revision history) and
`README.md` (orientation). **This file is the short list of rules that must hold.**

## Doctrine

1. **A clue must never contain its own answer — or any other answer in the puzzle.**
   Two rules, one principle: never hand the solver a word they are supposed to work
   for.
   - *Its own answer*, as a word or inside a longer one. `ROBE` clued "Bath**robe**"
     shipped, as did `ABLE`/"Cap**able**" and `FIRE`/"Camp**fire**".
   - *A neighbour's answer.* `BEST` was clued "Top-**rated**" while `RATE` sat
     directly below it as 5A — the same sin, one entry over.

   Applies to `packages/clue-data/clue-bank.json` just as much as to a puzzle,
   because `gen-minis3.mjs` copies bank clue text verbatim: a bad bank entry becomes
   a bad puzzle the moment a grid uses that answer. **Enforced** by
   `packages/clue-data/test/clue-hygiene-test.mjs`, which gates the deploy, and by a
   guard inside `gen-minis3.mjs` that makes the filler backtrack to a different word
   square. The rules, and the measurements that decided their exact shape, are
   documented at the top of `packages/clue-data/clue-rules.mjs` — read that before
   "improving" either. Looser variants were tried and rejected on data: substring
   matching flagged `NONE` → "Not one" and `ICE` → "Rink surf**ace**", so the own-clue
   rule matches word-wise and the cross-entry rule matches morphologically.

2. **Puzzle content is data, and data has a test.** New clues, a new mini, an
   appended bank entry — all of it goes through
   `npm test --workspace @crossword/clue-data` (pure node, no build, ~0.3s). It runs
   first in the root `npm test` precisely so a content mistake fails in
   milliseconds instead of after CI installs Playwright. Add new content invariants
   here rather than inventing a second checker.

3. **The engine is shared; theme and behaviour changes are not automatically local.**
   `TOKENS` in `packages/core/src/CrosswordPlayer.jsx` carries both the design tokens
   and the whole component stylesheet, and it is consumed by *four* call sites across
   `apps/player` and `apps/scramble`. Before editing it, know which apps you are
   repainting. The purple variant stays scoped because it hangs off an ancestor class
   (`.theme-purple`) that only the purple build applies — not by editing the palette.

4. **A colour test asserts what the browser computed, never a hardcoded hex.** The
   clue-pill contrast check once read `contrast("#076B3B", "#CDE8D4")` — two string
   literals, evaluated in node, never touching the DOM. It could not have caught a
   palette regression in either theme. Read used values (`rgb(r, g, b)`) off the
   rendered element instead; that is what proves the cascade actually resolved.

5. **The deploy is gated on `npm test` and nothing else.** `.github/workflows/deploy.yml`
   runs it before any build step, so anything reachable from root `npm test` blocks a
   bad release. If you add a workspace with tests, add it to the root script — a test
   nothing runs is decoration.

## Layout

```
packages/core        the engine: parsePuzzle, CrosswordPlayer, TOKENS, share codec
packages/clue-data   puzzle JSON (minis/ 5x5, minis3/ 3x3), clue-bank.json,
                     clue-rules.mjs (the content rules), gen-minis3.mjs
apps/player          the player.  green at /crossword-v1/, purple at /purple/
apps/scramble        the rearrange game at /crossword-v1/scramble/
_audit/              approved plans, read-only, append-only — never edit or tidy
```

## Related

- `HANDOVER.md` — architecture, puzzle schema, judgment calls already made, backlog
- `docs/color-spec-11.md` — the role-based colour system and both palette columns
- `packages/clue-data/README.md` — how to author clues and append to the bank
