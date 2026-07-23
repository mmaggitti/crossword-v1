# Crossword Player — PWA

The player app in the `crossword` monorepo. Installable, works offline, and puzzles travel inside their own share links. No backend.

It consumes two workspace packages — `@crossword/core` (the engine: parser, play-state hook, DOM renderer, share codec, design `TOKENS`) and `@crossword/clue-data` (the 10 bundled minis). Both are aliased to their **source** in `vite.config.js`, so editing the engine is a normal edit with no publish step.

---

## Run it

Everything installs from the **repo root** (one `npm install` wires up the whole workspace). Day-to-day commands work either from the root (delegated) or from this directory:

```bash
# from the repo root
npm install
npm run dev            # player dev server
npm run build          # -> apps/player/dist
npm test               # builds a fresh dist, then runs all 9 Playwright suites

# equivalently, from apps/player
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview  # serve dist/ locally, with the service worker active
npm test         # pretest builds dist, then runs the suites
```

`npm run dev` does **not** register the service worker. To test install and offline behaviour you need `build` + `preview`, or a real deployment. There is no separate bundle/inline step any more — the app is a plain Vite build (the retired v1 `build.js` single-file pipeline is gone).

---

## Routes

The app is a hash router (`src/App.jsx`):

| Hash | Shows |
|---|---|
| `#p=<base64url>` | A shared puzzle link — the player decodes it. |
| `#<mini-id>` (e.g. `#mini-003`) | A bundled mini, with a "‹ Puzzles" back button. |
| `#sample` | The engine's built-in sample (dev shortcut + test harness; no back button). |
| empty / other | The picker (`src/Picker.jsx`), listing all 10 minis. |

---

## Deploy

This app deploys with the monorepo: **push to `main`**, and `.github/workflows/deploy.yml` tests and ships it to GitHub Pages at `https://mmaggitti.github.io/crossword-v1/`. The Pages build runs with `BASE_PATH=/crossword-v1/` so assets and the service worker resolve under the sub-path.

`vite.config.js` reads `base` from `BASE_PATH` (defaulting to `/`), so the same build works root-hosted or under a sub-path:

| Target | What to do |
|---|---|
| **GitHub Pages, project site** (this app) | CI already sets `BASE_PATH=/crossword-v1/`. To build it by hand: `BASE_PATH=/crossword-v1/ npm run build`. |
| **Root / user-or-org site** | Default `BASE_PATH=/` is right. |
| **Cloudflare Pages / Netlify / Vercel** | Point at the repo, build command `npm run build --workspace player`, output `apps/player/dist`. |

HTTPS is not optional — service workers refuse to register without it (`localhost` is the one exception).

---

## Sharing puzzles

Press **share** in the header. It copies a URL with the whole puzzle encoded in the hash fragment:

```
https://your-site/#p=eyJzY2hlbWFWZXJzaW9uIjoxLCJpZCI6...
```

Anyone who opens that link gets that puzzle. No deploy, no database, no puzzle index to maintain. The hash fragment rather than a query string is deliberate: fragments are never sent to the server, so puzzle contents stay out of your host's access logs. The codec lives in `@crossword/core` (`packages/core/src/share.js`).

### Size limits — this is the real constraint

| Puzzle | Encoded URL |
|---|---|
| 5×5 mini | **~613 characters** — safe everywhere |
| 15×15, 78 clues | **~5,250 characters** — too long |

Roughly 2,000 characters is where messaging apps, link previewers, and some proxies start truncating. Minis have enormous headroom. Full-size puzzles do not. **If you go past minis**, add a `CompressionStream("deflate-raw")` deflate step in `share.js` (~70% smaller, ~1,700 chars for a 15×15). It's out of v1 because it makes `encodePuzzle`/`decodePuzzle` async, which ripples into the component's initial-state read.

---

## iOS notes

iOS treats PWAs differently enough to be worth stating plainly:

- **No install prompt.** Android/Chrome fires `beforeinstallprompt`; iOS Safari doesn't. Installing means Share → Add to Home Screen, done manually. Tell people that when you send the link.
- **Safari only.** Add to Home Screen from Chrome or Firefox on iOS produces a bookmark, not a standalone app.
- **`apple-touch-icon` is what shows on the home screen**, not the manifest icons. It's in `public/` and wired up in `index.html`.
- **Safe areas.** `viewport-fit=cover` in the viewport meta is what makes `env(safe-area-inset-bottom)` return real values — the keyboard tray uses it, so the bottom row clears the home indicator in standalone mode.
- **Storage eviction.** iOS has historically evicted data from sites unused for a stretch, treating home-screen-installed apps more favourably. This has moved around across iOS versions — treat any specific claim as worth re-checking. It doesn't affect anything today (nothing is persisted yet), but verify it before building saved progress on local storage.

---

## PWA build

The manifest and service worker are generated by **`vite-plugin-pwa`** (`vite.config.js`), not hand-written:

- `manifest` names the app, sets the warm `--canvas` `#FBF9F4` theme/background, and lists three icons — `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png` (the last with `purpose: "maskable"`, carrying extra padding so it survives Android's circle crop). `includeAssets` also precaches `apple-touch-icon.png` and `favicon-32.png`.
- `registerType: "autoUpdate"` + a Workbox precache of everything (`**/*.{js,css,html,png,svg,webmanifest}`) means the app is fully offline after first visit and a new deploy is picked up on next launch. The player also surfaces a Reload banner when a new version is waiting.

Icons live in `public/`. The icon artwork is a grid with blocks at 180°-rotationally-symmetric positions on the `--accent` green.

---

## What's in here

```
index.html            shell: viewport, theme colour, iOS meta, root sizing
vite.config.js        base path, @crossword/* source aliases, vite-plugin-pwa
src/main.jsx          mount point
src/App.jsx           hash router (see Routes above)
src/Picker.jsx        the 10-minis picker (reuses the engine's TOKENS)
public/               icons: 192, 512, maskable 512, apple-touch, favicon-32
test/                 Playwright harness — see test/README.md
```

The player component itself lives in `@crossword/core`, not here — this app is the router, the picker, and the PWA shell around it.

---

## Caveats

- **Progress isn't saved.** Refreshing loses letters. Offline caching caches the *app*, not your state — those are unrelated. It's backlog item B1 in `HANDOVER.md`, and the headline of a future player-v2.
- The 10 minis ship in the build (via `@crossword/clue-data`); any other puzzle arrives by share link.
- A malformed `#p=` falls back silently rather than erroring — the app shows the picker.
- The share link is read once on mount. Pasting a new `#p=` link into an open tab won't swap the puzzle without a reload — deliberate, so an accidental hash change can't wipe in-progress letters. (Switching between bundled minis works live, via the hash router.)
