---
title: "crossword-game"
description: "Mobile-first offline crossword player — an npm-workspaces monorepo (shared engine + player app) deployed to GitHub Pages by CI"
---

# crossword-game

Mobile-first, offline crossword **player** built as an npm-workspaces monorepo: a shared engine (`@crossword/core`) and the app that consumes it (`apps/player`). Deployed to GitHub Pages by GitHub Actions.

**Live:** `https://mmaggitti.github.io/crossword-v1/`

Everything needed to continue development is here. **Start with `HANDOVER.md`** — it has the architecture, the layout invariants that will silently break if you're careless, the full revision history, and notes on working with Mark.

```
HANDOVER.md              ← read first
package.json             workspaces: ["apps/*", "packages/*"]; root scripts delegate to the player
.github/workflows/deploy.yml   CI: test-gated deploy to Pages
packages/
  core/                  @crossword/core — the shared engine
    src/CrosswordPlayer.jsx   parser + play-state hook + DOM renderer + design TOKENS
    src/share.js              puzzle <-> URL hash (#p= base64url)
    src/index.js              exported surface
  clue-data/             @crossword/clue-data — bundled content
    index.js                  exports { minis, minisById }
    minis/mini-001.json … 010 the 10 minis, generated from ../../mini-crosswords.md
    clue-bank.json            the 1,574-word fill pool (reference, not imported at runtime)
apps/
  player/                the player app; consumes @crossword/core + @crossword/clue-data
    index.html  vite.config.js  package.json
    src/{main.jsx, App.jsx, Picker.jsx}   hash router + puzzle picker
    test/                     Playwright harness — 9 .cjs suites + _serve.cjs, Chromium + WebKit
docs/color-spec-11.md    the palette this is built against, plus the judgment calls made against it
mini-crosswords.md       the minis in prose; source for packages/clue-data/minis
```

## First run

All commands run from the repo root:

```bash
npm install            # installs the whole workspace
npx playwright install chromium webkit

npm run dev            # player dev server, localhost:5173, no service worker
npm run build          # vite build -> apps/player/dist
npm test               # builds a fresh dist, then runs all 9 suites
npm run test:webkit    # geometry + paint in Safari's engine
```

`npm test`'s `pretest` step builds the dist the suites serve, so you never need a separate build call before testing.

## Routes

The player is a hash router (`apps/player/src/App.jsx`):

- `#p=<base64url>` — a shared puzzle link; the player decodes it.
- `#<mini-id>` (e.g. `#mini-003`) — a bundled mini, with a "‹ Puzzles" back button.
- `#sample` — the engine's built-in sample (dev shortcut + test harness; no back button).
- empty / anything else — the picker, listing all 10 minis.

## The one rule

**jsdom is not enough.** It renders the DOM but computes no geometry, so layout bugs pass every unit test and land on the device instead. Three separate fixes shipped broken that way before the Playwright harness existed. The suites run against the *served* Vite build (`apps/player/dist` over HTTP via `_serve.cjs`), and all nine now gate the deploy. Run them after every change — they're fast, and each one is there because it caught something real.

## Deploying

Push to `main`. `.github/workflows/deploy.yml` runs `npm ci`, installs the Playwright browsers, runs the full suite (**a failing suite blocks the deploy**), rebuilds with `BASE_PATH=/crossword-v1/`, and publishes `apps/player/dist` to GitHub Pages. No manual upload — the old single-file iPhone-upload workflow is retired.

v1.1 deploys **into** the `mmaggitti/crossword-v1` repo, overwriting the retired single-file v1 that used to live there. Every share link ever minted against `…/crossword-v1/#p=…` keeps resolving, because v1.1 decodes the identical `#p=` share format — backward compatibility, not a separate frozen copy. The old single-file v1 remains in the repo's git history.

See `HANDOVER.md` for depth on the architecture, layout invariants, and the design system.
