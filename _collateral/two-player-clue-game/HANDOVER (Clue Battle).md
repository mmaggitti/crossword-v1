# ClueBattle — Project Handover

> Rename to `CLAUDE.md` if you want Claude Code to auto-load this as project context.

A two-player, simultaneous-race crossword-clue mini-game, plus (secondary goal) a small crossword *creator* for generating real interlocking mini grids. This doc captures every decision, resource, and open question from the planning phase so development can start cold.

---

## 1. What we're building

- **Core game:** Two players race through the **same set of 10 crossword clues** simultaneously. First to finish wins. Fast, casual, replayable.
- **Secondary goal:** A **mini-crossword constructor** (5×5) so the game can serve *real interlocking crosswords*, not just one-clue-at-a-time questions. Separate authoring tool that feeds the game.
- **Hard constraint:** **iPhone-first.** Must run well on mobile Safari. This gates every visual/perf decision.
- **Dev environment:** Claude Code, using the `claudedesignskills` plugin stack for the frontend/animation layer.

---

## 2. Build environment & tooling

### claudedesignskills (freshtechbro/claudedesignskills)
- A **Claude Code plugin marketplace** of ~22 skills focused on **3D and animation** for the web. Install: `/plugin marketplace add freshtechbro/claudedesignskills` (or upload individual skills to claude.ai). Auto-activates when a relevant task is detected.
- **Scope boundary — important:** it only covers the **presentation layer**. It will *not* design your multiplayer model, data pipeline, scoring, or game logic. Those are yours to build.
- **Relevant subset for this game:**
  - `motion-framer` (Framer Motion) or `gsap-scrolltrigger` (GSAP) — transitions, countdowns, timer animation
  - `react-spring-physics` — tactile input feedback
  - `lottie-animations` / `animejs` — correct/incorrect and celebration moments
  - `modern-web-design` — overall aesthetic direction
  - `threejs-webgl` + `react-three-fiber` (+ `@react-three/rapier` for physics) — the true-3D answer mechanics
  - `pixijs-2d` — GPU-accelerated 2.5D when a mechanic doesn't need real 3D (far lighter on mobile)
  - `rive-interactive` — interactive vector animation at near-zero cost (great on iPhone)
  - `spline-interactive` — quickly authored interactive scenes (watch bundle size)
  - `lightweight-3d-effects` (Vanta) — cheap animated 3D backdrops
  - `blender-web-pipeline` / `substance-3d-texturing` — if/when you author custom 3D assets
- **Overkill for v1 (skip — heavy on mobile):** `babylonjs-engine`, `playcanvas-engine`, `aframe-webxr`.

---

## 3. Data — accessing clues

### Primary source: xd.saul.pw → `xd-clues.zip`
- The xd project (Saul Pwanson / Century Arcade) publishes three archives at https://xd.saul.pw/data:
  - **`xd-clues.zip`** (67 MB) — **6,000,000+ answer/clue usages grouped by publication-year. This is your source.** Spans dozens of publications (NYT, WSJ, LA Times, Newsday, USA Today, The New Yorker, …) across decades.
  - `xd-puzzles.zip` (12 MB) — ~6,000 **full** NYT puzzles in `.xd` format, but **pre-1965 only** (public domain). Only relevant if you later want complete interlocking grids with clean copyright.
  - `xd-metadata.zip` (2 MB) — puzzle metadata + grid similarity. No clues.
- **The "only up to 1965" trap:** that limit is `xd-puzzles.zip` (full puzzle files). `xd-clues.zip` is *not* capped at 1965 — it's the bulk of modern clue coverage.
- xd is the acknowledged successor to Matt Ginsberg's old "cluer" database (no longer maintained).

### Licensing posture (personal use)
- Individual clue/answer pairs aren't strongly copyrightable; xd distributes them as **aggregated data**, which is why the corpus is downloadable while full modern puzzles are not.
- **This app is personal, non-commercial, non-distributed** → downloading and using `xd-clues.zip` locally is fine.
- **Do not:** redistribute the corpus, or scrape live NYT / XWordInfo (that's NYT copyright + ToS). If you ever ship or share the app publicly, revisit the entire licensing picture.

### What NOT to buy / use
- **XWordInfo's paid $50 word list** — it's **scored answer words for grid-filling, with no clues.** Won't source your questions.
- **XWordInfo's on-site clues** — searchable/viewable (Finder + Clue Search), but **lookup-only, no bulk download.** Getting them into an app means scraping (NYT-copyrighted, against ToS). Skip.

### Second dataset — only for the constructor (fill side)
- Grid-*filling* needs a **scored answer word list** (different artifact from clues). Free standards:
  - **Spread the Word(list) (STWL)** — ~303K entries, scored 0–60, `.txt`/`.dict`, updated quarterly.
  - **Peter Broda's Wordlist** — ~427K scored entries (1–100); large but includes junk/objectionable entries (cleaned subsets exist).
- You do **not** need a paid list for construction either.
- **Scale gotcha:** STWL (0–60) and Broda (0–100) use different scoring scales — normalize before combining.

---

## 4. Architecture & development approach

### Five layers, built bottom-up
1. **Data (Python ETL)** — unpack `xd-clues.zip`, profile it empirically, filter, emit a clean question bank (JSON/SQLite).
2. **Game logic** — the race state machine (pure, framework-agnostic).
3. **Multiplayer/transport** — the decision that gates the stack (see §9).
4. **Presentation** — React + claudedesignskills.
5. **iPhone testing throughout** — not at the end.

### Recommended sequence
1. Lock the gating design questions (§6).
2. Build the question bank (profile the data *before* investing in visuals — set difficulty cutoffs from the distribution, not round numbers).
3. Validate the loop with the **flat pass-and-play prototype** (already built — §8).
4. Add animation/polish via the skillstack.
5. Add networked multiplayer if wanted.

### The three isolated seams (the whole point of the prototype)
Everything bolts onto these without touching the engine:

- **DATA seam** — questions shaped `{ clue, answer }`, exactly like xd. Swap the placeholder constant for ETL output; nothing downstream changes.
- **MECHANIC seam** — every answer input is a component with one contract: `{ question, onSolved, active }`. `LetterCells` (flat) ships in v0; `GrabOrb` (R3F), `IdentifyInModel`, etc. implement the *same* contract and drop into the same slot. **This is your 3D layering seam.**
- **OPPONENT seam** — the second racer is abstracted. v0 = simulated bot (real solo-testable race). Swap for `LocalOpponent` (pass-and-play) or `NetworkOpponent` (WebSocket). The engine treats opponent progress as opaque ticks, so bot and human are interchangeable to it.

### Target project structure (when the single-file prototype becomes real)
```
src/
  data/loadPuzzle.js          # DATA seam — fed by Python ETL output
  mechanics/
    index.js                  # registry: { letterCells, grabOrb, ... }
    LetterCells.jsx           # v0 flat mechanic
    GrabOrb.jsx               # first R3F mechanic (same contract)
  engine/raceReducer.js       # pure state machine (won't be rewritten)
  opponent/
    BotOpponent.js            # v0
    NetworkOpponent.js        # later
  App.jsx                     # shell
etl/                          # Python — separate authoring/data tooling
constructor/                  # Python — mini-crossword creator (§10)
```

### The scene-module contract (design it well up front)
Each MECHANIC should be able to report more than "solved." Recommended contract to grow into:
- `onSolved({ correct, timeMs })` — per-answer timing (needed for speed-scoring; **cheap now, painful to retrofit** — see §8 gaps)
- optional `onProgress(fraction)` — feeds opponent "ghost progress" displays
- optional hint/skip state
Keep the contract identical across flat and 3D mechanics so the engine never special-cases.

---

## 5. Design decisions locked so far

- **A1 — Game mode:** Simultaneous race. Both see the same clue at once; first to finish all 10 wins.
- **B1 — Multiplayer:** Support **both** local pass-and-play and networked two-device play if feasible.
- **C1 — Answer input:** Intentionally **open-ended.** Experiment with different mechanics (merging other puzzle types, visual/3D scene-based selection); don't commit to plain type-in.

---

## 6. Open design questions

Gating three (answer first): **A2/A3** (race semantics), **B2** (real-time vs async), **C2** (show letter count?).

**A. Competition structure**
- A2. First-to-buzz locks a question, or each player answers all 10 on their own clock and you compare?
- A3. Same 10 in the same order for both, or shuffled per player? (Order matters for fairness if speed counts.)
- A4. Single round of 10, or multi-round match?

**B. Multiplayer model**
- B2. Real-time (live opponent progress) or async/turn-notification?
- B3. How do players connect — room code, invite link, matchmaking?
- B4. Rejoin-after-disconnect, or disposable/casual?

**C. Question & answer format**
- C2. Show the answer's letter count (crossword convention) or hide it?
- C3. Progressive letter reveals / hints? Do hints cost points?
- C4. Validation strictness: exact / case-insensitive / typo-tolerant / accept any historically-valid answer for that clue (xd gives you that set)?
- C5. Time limit per question, per set, or untimed?

**D. Scoring & win conditions**
- D1. Correctness only, or speed-weighted?
- D2. Streak bonuses / wrong-answer or skip penalties?
- D3. Tiebreaker rule?
- D4. Score visible live, or revealed at the end?

**E. Content curation**
- E1. NYT-only (consistent voice) or mixed publications?
- E2. Difficulty by answer length, answer commonness/frequency, or explicit tiers? (Derive from the distribution.)
- E3. Filter dated/obscure/proper-noun-heavy clues? Era cutoff?
- E4. Fixed curated set, random each match, or themed packs?

**F. Visual & motion design**
- F1. Aesthetic — arcade / minimal / retro / neon-competitive?
- F2. 2D + motion for v1, or a WebGL/3D flourish?
- F3. Which feedback moments to animate first: countdown, correct/incorrect, opponent-scored, round-win?
- F4. Head-to-head layout — split view, dual bars, avatars?
- F5. Sound and/or haptics on iPhone?

**G. Platform & scope**
- G1. Beyond iPhone Safari — install-as-PWA? Desktop?
- G2. Portrait-only or landscape too?
- G3. Throwaway mockup, or foundation for the real build?

---

## 7. Mechanic brainstorm (3D across the interface / FOV)

Treat the 3D scene as the answer mechanic itself, not decoration. Organized by zone:

**Answer-selection scenes (the C1 experiment ground)**
- **Embodied clue** — render a manipulable 3D model; tap the referenced part (rotate a flower → tap the petal). Turns clues into "identify-in-scene." (R3F + raycasting)
- **Grab-the-answer physics** — candidate words as 3D objects; fling/tap the right one; in a race both reticles converge on the same object. (`@react-three/rapier`)
- **Letter constellation / path-drawing** — letters as nodes in space; drag a path to spell the answer (Boggle-in-3D; handles anagram/merged mechanics)
- **Depth-as-difficulty** — answer + distractors at different Z-depths; nearer = safer/fewer points (ties mechanic to scoring)
- **Rotating ring/carousel** — options on a 3D cylinder; spin to select (holds many choices without clutter)
- **Pluggable scene-type per question** — each question declares its mechanic; the 3D layer becomes an engine for a *variety pack* of micro-mechanics.

**Camera / FOV as a game device**
- **Gyroscope parallax** (`DeviceOrientation`) — tilt shifts the camera. Mobile-native, cheap, high-impact — **prototype this early; best ROI.**
- **Cinematic camera** — punch in on the clue, pull back on transitions, quick orbit on correct (drive via GSAP timeline)
- **FOV as a stress cue** — widen field of view / tunnel effect as the timer drains
- **Across-the-table framing** — seat the player facing the opponent; clue materializes on the shared table
- **Rack focus / DOF** — blur periphery, snap focus to the opponent on a steal (postprocessing — watch perf)

**Opponent presence**
- Reactive abstract avatar (leans in, flinches, celebrates); translucent "ghost progress"; a physical pressure meter / tug-of-war beam between the two players.

**Feedback / environment / transitions**
- Correct = physics thunk + particle burst + shockwave; wrong = recoil + shake; timer as a physical body (draining column, orbiting object); streak escalates lighting.
- Swappable themed arenas per pack (Vanta for cheap backdrops); questions as travel (camera flies between 10 stations); flat clue card extrudes into the 3D scene.

**Mobile-perf reality:** WebGL runs on iPhone but heavy scenes, postprocessing, high particle counts, and big textures tank framerate/battery. Budget per view: low-poly, instanced meshes, baked lighting, texture atlases, restrained postprocessing, and a 2D fallback path per device.

---

## 8. The prototype (v0 — already built)

- **What it is:** a flat crossword-clue race in a single React file. Clue → letter cells → check, raced against a simulated bot. Trivially easy placeholder clues, just to validate the loop.
- **Mobile input:** an invisible `<input>` overlays the cells (OTP-input pattern) → reliable iOS keyboard on tap; 16px font avoids Safari zoom.
- **Quality floor applied:** mobile-first, visible focus ring, `prefers-reduced-motion` respected. System fonts on purpose (swap for display faces later via the skillstack).
- **The three seams are marked `⟵ SWAP POINT`** in the source (DATA / MECHANIC / OPPONENT).
- **Two honest gaps to close when going real:**
  1. **Per-question timing isn't recorded** (only total). Extend the mechanic contract to `onSolved({ correct, timeMs })` now — speed-weighted scoring will need it and it's annoying to retrofit.
  2. **The bot solves on a blind schedule** — it doesn't react to your pace. Fine for feel-testing, wrong for a real opponent.
- Full source is in **Appendix A** and shipped alongside this doc as `clue-battle.jsx`.

---

## 9. Crossword construction (the mini creator)

Construction is a separate discipline from solving. Minis are its tractable corner — rolling your own filler is a real but small project.

**Decomposition**
- **Grid design** — pattern/symmetry/connectivity/min-length. Near-trivial for a 5×5.
- **Grid fill** — the algorithmic core (below).
- **Fill quality** — filling *legally* is easy; filling *well* (lively, no crosswordese) is the real work, and it's mostly a function of the scored word list.
- **Cluing** — the creative/editorial part; hardest to automate.

**Fill algorithm (standard, well-documented)**
- Model as a **constraint-satisfaction problem**: slots = variables, words of matching length = domains, shared cells = constraints. Solve with **backtracking + arc-consistency (AC-3) + heuristics** (most-constrained slot first, highest-scored word first). It's a standard CS50-AI exercise; reference implementations abound.
- **Perf trick:** index the word list by `(length, position → letter)` so "all 5-letter words with A in slot 2" is instant. A 5×5 then fills in milliseconds.
- **Mini gotcha:** an all-white 5×5 is the *most* constrained case (a double word square — every cell in two 5-letter words). A couple of black squares makes filling much easier but changes the look.
- **References:** Michael Wehar's open-source Python filler demos directly on a 5×5 with a sample word list + Flask UI; plus the canonical CSP crossword generators (`crossword.py` + `generate.py`).

**Cluing**
- Use `xd-clues` for every historical clue per answer as a starting point. Good clues are still craft — a natural place to let an LLM draft candidates (Anthropic API) *grounded in the real xd clues*, then curate.

**Effort calibration**
- Working mini filler (legal, decently-filled 5×5s from a scored list): a small self-contained project, ~days.
- Good-feeling fill: score-weighted ordering + junk filter → tuning, not new architecture.
- Cluing pipeline: easy to wire; quality is the open tail.
- Themes / 15×15s: a much larger beast — **skip for now.** Minis dodge nearly all the hard construction problems.

**How it fits:** the constructor is a **separate Python authoring tool** that emits puzzle files. The game consumes them through the DATA seam, and a full interlocking grid becomes just another **MECHANIC** alongside `LetterCells`.

---

## 10. Topics to discover before/early in development

Things we *haven't* worked through that you'll hit. Grouped by area.

**Multiplayer & networking (biggest undiscovered area)**
- Backend choice for real-time: PartyKit, Supabase Realtime, Firebase RTDB, Ably, or self-hosted `ws`. Trade-offs on setup, mobile-friendliness, cost.
- **State authority:** who's the source of truth (server vs client)? Client-side answer checking is trivially cheatable.
- **Race fairness:** when does the clock start for both players given network latency? How is "first to finish" adjudicated fairly?
- Lobby/room lifecycle, reconnection, and what happens when one player drops mid-race.

**Data engineering (xd-clues is messy)**
- Cleaning depth: fill-in-the-blank clues, cross-references ("see 34-Across"), date/topical references, clues that leak the answer, duplicates, abbreviations, offensive/non-English answers.
- Multiple valid answers per clue; rebus/multi-word entries; diacritics; British vs American spellings.
- Difficulty scoring/tiering from the data (frequency as a signal). Do the profiling **first**.

**iPhone / mobile specifics**
- PWA setup (installability, offline), safe-area/notch handling, on-screen-keyboard vs layout, WebGL perf budgeting on Safari, battery.
- iOS gotchas: audio autoplay unlock (needs a user gesture — relevant if you add sound via Tone.js), haptics API availability, preventing pinch-zoom/scroll, touch-target sizing.
- Test on a **real device**, not just the simulator.

**3D-in-React (R3F) fundamentals**
- Canvas lifecycle, `useFrame` discipline, instancing, frame budgeting.
- Asset loading (glTF via the Blender pipeline), and **bundle-size management** — 3D libs are heavy; code-split per mechanic and lazy-load.
- A concrete 2D fallback strategy for low-end/perf-constrained sessions.

**Game design / scoring**
- If speed-weighted: the actual formula, tiebreakers, and how to display it fairly in real time.
- Puzzle determinism: seeded selection so both players provably get the identical set.

**Persistence & identity**
- Do players have identities? Score history, stats, streaks — stored where (local vs backend)? None needed for pure pass-and-play.

**Construction-specific**
- Grid pattern generation + symmetry enforcement (if not all-white); seed/theme entries.
- Word-list score-scale normalization (STWL 0–60 vs Broda 0–100); pruning objectionable entries.
- Clue-assignment UX and **puzzle file format** — standardize on `.xd`, `.ipuz`, or `.puz` so puzzles are portable between the constructor, the game, and other tools. (A real early decision.)

**Cross-cutting**
- Accessibility: the you/rival color-coding needs a color-blind-safe palette; screen-reader labels; font scaling. (Reduced-motion is already handled in the prototype.)
- Licensing **if you ever share it**: personal-use is fine now; distribution changes everything (corpus redistribution + NYT copyright).

---

## 11. Immediate next steps

1. **Answer the gating questions** (A2/A3, B2, C2) — they shape the engine and transport.
2. **Build the Python ETL** over `xd-clues.zip`: profile (clue counts by publication/year, answer-length + answer-frequency distributions), filter, emit a JSON/SQLite question bank behind the DATA seam.
3. **Scaffold the prototype into a Vite project** using the structure in §4; wire the real question bank in.
4. **Add `onSolved({ correct, timeMs })`** to the mechanic contract before building more mechanics.
5. **Prototype `GrabOrb`** (R3F) against the same contract to prove a 3D mechanic slots in with one line changed.
6. In parallel (independent track): **spin up the Python mini-filler** (CSP + STWL/Broda scored list, demo on 5×5).

---

## Appendix A — Prototype source (`clue-battle.jsx`)

```jsx
import { useReducer, useState, useEffect, useRef, useCallback } from "react";

/* ============================================================================
   CLUE-BATTLE · v0 core loop
   ----------------------------------------------------------------------------
   A flat crossword-clue race. Deliberately minimal. The ARCHITECTURE is the
   deliverable: three seams — DATA, MECHANIC, OPPONENT — are isolated so you can
   layer real xd.saul.pw data, 3D answer scenes, and networked play on top
   WITHOUT touching the game engine. Each seam is marked ⟵ SWAP POINT below.
   ========================================================================== */

/* ---------- Theme (system fonts on purpose — swap for display faces later) -- */
const C = {
  bg: "#0F111A", surface: "#191D2B", cell: "#20263A", cellBorder: "#2E3550",
  cellActive: "#3B4470", text: "#EAECF5", muted: "#868FAD",
  you: "#5B9DFF", opp: "#F45D9E", ok: "#46C46B",
};
const SANS = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace";

const norm = (s) => s.toUpperCase().replace(/[^A-Z]/g, "");

/* ============================================================================
   1 · DATA LAYER                                              ⟵ SWAP POINT
   Shape mirrors xd.saul.pw: { clue, answer }. Replace this constant with the
   output of your Python ETL over xd-clues.zip and nothing downstream changes.
   (Placeholder clues are trivially easy — just to feel the loop.)
   ========================================================================== */
const PUZZLE = [
  { clue: "Feline pet", answer: "CAT" },
  { clue: "Frozen water", answer: "ICE" },
  { clue: "Opposite of night", answer: "DAY" },
  { clue: "Body of salt water", answer: "SEA" },
  { clue: "Not false", answer: "TRUE" },
  { clue: "Deep red gem", answer: "RUBY" },
  { clue: "Part of a blossom", answer: "PETAL" },
  { clue: "Ruler's headwear", answer: "CROWN" },
  { clue: "The planet underfoot", answer: "EARTH" },
  { clue: "Wide smile", answer: "GRIN" },
];

/* ============================================================================
   2 · MECHANIC INTERFACE                                      ⟵ SWAP POINT
   Contract every answer mechanic implements:
     props: { question: {clue, answer}, onSolved: () => void, active: boolean }
   The engine renders whatever mechanic it's handed and doesn't know which.
   v0 = LetterCells (flat). Later: GrabOrb (R3F), IdentifyInModel, PathThrough…
   Register new ones in MECHANICS and select per-question later.
   NOTE (handover §8 gap): grow onSolved to onSolved({ correct, timeMs }).
   ========================================================================== */
function LetterCells({ question, onSolved, active }) {
  const target = norm(question.answer);
  const len = target.length;
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (active) inputRef.current?.focus(); }, [active]);

  const onChange = (e) => {
    if (!active) return;
    const next = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, len);
    setValue(next);
    if (next === target) {
      onSolved();
    } else if (next.length === len) {
      setBad(true);
      setTimeout(() => { setBad(false); setValue(""); inputRef.current?.focus(); }, 440);
    }
  };

  return (
    <div
      className={bad ? "cb-shake" : ""}
      style={{
        position: "relative", display: "flex", gap: 10, justifyContent: "center",
        outline: focused ? `2px solid ${C.you}66` : "2px solid transparent",
        outlineOffset: 10, borderRadius: 16, padding: "6px 2px",
      }}
    >
      {Array.from({ length: len }).map((_, i) => {
        const ch = value[i] || "";
        const isCur = i === value.length && focused;
        return (
          <div key={i} style={{
            width: 52, height: 64, display: "grid", placeItems: "center",
            fontFamily: MONO, fontSize: 30, fontWeight: 600, color: C.text,
            background: C.cell,
            border: `2px solid ${bad ? C.opp : isCur ? C.cellActive : C.cellBorder}`,
            borderRadius: 12, transition: "border-color .12s",
            boxShadow: ch ? `inset 0 -3px 0 ${C.you}55` : "none",
          }}>{ch}</div>
        );
      })}
      {/* invisible input overlays the cells → reliable iOS keyboard on tap */}
      <input
        ref={inputRef}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={!active}
        inputMode="text" autoCapitalize="characters" autoCorrect="off"
        autoComplete="off" spellCheck={false}
        aria-label={`Answer, ${len} letters`}
        style={{
          position: "absolute", inset: 0, opacity: 0, cursor: "text",
          border: 0, background: "transparent", fontSize: 16, // 16px avoids iOS zoom
        }}
      />
    </div>
  );
}

const MECHANICS = { letterCells: LetterCells }; // registry for future mechanics

/* ============================================================================
   3 · GAME ENGINE — race state machine (pure logic, framework-agnostic)
   First racer to finish all questions wins. Both run on one real-time clock.
   ========================================================================== */
const TOTAL = PUZZLE.length;
const initial = {
  phase: "ready", index: 0, oppSolved: 0, winner: null,
  startedAt: 0, myMs: null, oppMs: null,
};
function reducer(s, a) {
  switch (a.type) {
    case "START":
      return { ...initial, phase: "racing", startedAt: a.now };
    case "SOLVE": {
      const index = s.index + 1;
      if (index >= TOTAL) // I finished first
        return { ...s, index, phase: "done", winner: "you", myMs: a.now - s.startedAt };
      return { ...s, index };
    }
    case "OPP": {
      if (s.phase !== "racing") return s;
      if (a.count === s.oppSolved && a.count < TOTAL) return s; // no change
      if (a.count >= TOTAL) // opponent finished first
        return { ...s, oppSolved: TOTAL, phase: "done", winner: "opp", oppMs: a.now - s.startedAt };
      return { ...s, oppSolved: a.count };
    }
    case "RESET":
      return initial;
    default:
      return s;
  }
}

/* ---------- small presentational bits ---------- */
function Track({ label, count, color }) {
  const pct = Math.round((count / TOTAL) * 100);
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: .4, color }}>{label}</span>
        <span style={{ fontSize: 12, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{count}/{TOTAL}</span>
      </div>
      <div style={{ height: 8, background: "#00000055", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .25s ease" }} />
      </div>
    </div>
  );
}

/* ============================================================================
   4 · PRESENTATION — mobile-first shell
   ========================================================================== */
export default function App() {
  const [s, dispatch] = useReducer(reducer, initial);
  const [elapsed, setElapsed] = useState(0);
  const scheduleRef = useRef([]);

  /* ---- OPPONENT ⟵ SWAP POINT --------------------------------------------
     v0: a bot with a randomized solve schedule. Replace with a LocalOpponent
     (pass-and-play) or NetworkOpponent (WebSocket) that dispatches OPP ticks. */
  const start = () => {
    const base = 2600, jitter = 1300; // ms per question, ± jitter
    let acc = 0;
    scheduleRef.current = PUZZLE.map(() => (acc += base + (Math.random() * 2 - 1) * jitter));
    dispatch({ type: "START", now: performance.now() });
  };

  // race ticker: drives the timer and the bot's progress off one real clock
  useEffect(() => {
    if (s.phase !== "racing") return;
    const id = setInterval(() => {
      const now = performance.now();
      const el = now - s.startedAt;
      setElapsed(el);
      const count = scheduleRef.current.filter((t) => t <= el).length;
      dispatch({ type: "OPP", count, now });
    }, 120);
    return () => clearInterval(id);
  }, [s.phase, s.startedAt]);

  const onSolved = useCallback(() => {
    dispatch({ type: "SOLVE", now: performance.now() });
  }, []);

  const q = PUZZLE[Math.min(s.index, TOTAL - 1)];
  const Mechanic = MECHANICS.letterCells;
  const finalMs = s.myMs ?? s.oppMs ?? elapsed;
  const secs = (finalMs / 1000).toFixed(1);
  const liveSecs = (elapsed / 1000).toFixed(1);

  return (
    <div style={{
      minHeight: "100dvh", background: C.bg, color: C.text, fontFamily: SANS,
      display: "flex", justifyContent: "center", padding: "20px 16px 40px",
    }}>
      <style>{`
        *{box-sizing:border-box}
        .cb-shake{animation:cbShake .42s}
        @keyframes cbShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}
        .cb-btn{transition:transform .1s, filter .15s}
        .cb-btn:active{transform:translateY(1px)}
        .cb-btn:focus-visible{outline:3px solid ${C.you};outline-offset:3px}
        @media (prefers-reduced-motion: reduce){.cb-shake{animation:none}*{transition:none !important}}
      `}</style>

      <div style={{ width: "100%", maxWidth: 460 }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -.3 }}>
            Clue<span style={{ color: C.you }}>Battle</span>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 14, color: s.phase === "racing" ? C.text : C.muted, fontVariantNumeric: "tabular-nums" }}>
            {s.phase === "racing" ? liveSecs : s.phase === "done" ? secs : "0.0"}s
          </div>
        </div>

        {/* racer tracks */}
        <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
          <Track label="YOU" count={s.index} color={C.you} />
          <Track label="RIVAL" count={s.oppSolved} color={C.opp} />
        </div>

        {/* body */}
        {s.phase === "ready" && (
          <div style={{ textAlign: "center", paddingTop: 24 }}>
            <p style={{ color: C.muted, lineHeight: 1.5, margin: "0 0 24px" }}>
              Ten clues, same set for both racers. Type each answer into the cells.
              First to finish all ten wins.
            </p>
            <button className="cb-btn" onClick={start} style={btn(C.you)}>Start race</button>
          </div>
        )}

        {s.phase === "racing" && (
          <div style={{ background: C.surface, borderRadius: 20, padding: "26px 20px 30px", border: `1px solid ${C.cellBorder}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 10 }}>
              {s.index + 1} / {TOTAL}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.35, minHeight: 60, marginBottom: 22 }}>
              {q.clue}
            </div>
            <Mechanic key={s.index} question={q} onSolved={onSolved} active />
          </div>
        )}

        {s.phase === "done" && (
          <div style={{ textAlign: "center", paddingTop: 20 }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: s.winner === "you" ? C.ok : C.opp, marginBottom: 8 }}>
              {s.winner === "you" ? "You win" : "Rival wins"}
            </div>
            <p style={{ color: C.muted, margin: "0 0 6px" }}>
              You solved {s.index}/{TOTAL} · Rival {s.oppSolved}/{TOTAL}
            </p>
            <p style={{ fontFamily: MONO, color: C.text, margin: "0 0 26px" }}>{secs}s</p>
            <button className="cb-btn" onClick={() => dispatch({ type: "RESET" })} style={btn(C.you)}>Play again</button>
          </div>
        )}
      </div>
    </div>
  );
}

function btn(color) {
  return {
    background: color, color: "#0B0E16", border: 0, borderRadius: 12,
    padding: "14px 28px", fontSize: 16, fontWeight: 700, cursor: "pointer",
    fontFamily: SANS,
  };
}
```

---

## Appendix B — Resources

**Data**
- xd corpus downloads — https://xd.saul.pw/data (`xd-clues.zip` is the one you want)
- xd main site (browse/compare) — https://xd.saul.pw

**Construction word lists (free, scored)**
- Spread the Word(list) — search "Spread the Wordlist Husic Anguiano"
- Peter Broda's Wordlist — https://peterbroda.me/crosswords/wordlist/
- Chris Jones' scored list — https://github.com/christophsjones/crossword-wordlist
- Wordlist DB tooling (Python) — https://github.com/mattabate/wordlist

**Construction / fill references**
- Michael Wehar, Automatic Crossword Puzzle Filling (Python, 5×5 demo) — https://github.com/MichaelWehar/Automatic-Crossword-Puzzle-Filling
- crosswordconstruction.com (the above, hosted)
- GitHub topic hub — https://github.com/topics/crossword

**Tooling**
- claudedesignskills — https://github.com/freshtechbro/claudedesignskills

**Reference only (do not scrape / not your data source)**
- XWordInfo — https://www.xwordinfo.com (clue lookup + paid word list; no bulk clue download)
