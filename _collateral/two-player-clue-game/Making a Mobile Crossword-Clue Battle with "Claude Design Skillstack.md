# Making a Mobile Crossword-Clue Battle Game Fun with the "Claude Design Skillstack"

## TL;DR
- The `claudedesignskills` repo is not a library of finished games — it is a **Claude Code plugin marketplace of 22 skills (27 plugins) that teach Claude how to write code** with Three.js, R3F, GSAP, Framer Motion, Rive, PixiJS, Spline and more, complete with 50+ generator scripts and slash commands. There is no showcase of shipped games; its value to you is that it lets Claude scaffold correct, idiomatic animation/3D code fast.
- For an **iPhone-first React crossword game, the highest-ROI tools are the lightweight/2D ones** in the stack — Framer Motion (`motion-framer`), React Spring (`react-spring-physics`), GSAP (`gsap-scrolltrigger` incl. SplitText), Rive (`rive-interactive`), canvas-confetti/tsParticles, and the CSS-3D "modern-web-design" tricks. Heavy WebGL (Three.js/R3F, Babylon, Spline) is "impressive but heavy" and should be reserved for one hero moment with strict budgets and 2D fallbacks.
- Concrete wins for your clue-race: spring-physics letter cells, GSAP SplitText letter reveals, a Rive state-machine mascot/timer that reacts to correct/wrong/streak, particle bursts on solve, a head-to-head dual-progress "race track" bar, and haptics via the iOS `<input type=checkbox switch>` hack (with the important caveat that Apple patched this in iOS 26.5) — all cheap on battery and bundle.

## Key Findings

### 1. What the repo actually is
- `freshtechbro/claudedesignskills` ("Claude Design Skillstack") is a **Claude Code plugin marketplace**, MIT-licensed, with **579 stars and 89 forks as of July 2026** (per the repo's GitHub page: "Fork 89 · Star 579"). It bundles **22 skills / 27 plugins** organized into 5 bundles: `core-3d-animation` (Three.js, GSAP, R3F, Motion, Babylon), `extended-3d-scroll` (A-Frame, Vanta, PlayCanvas, PixiJS, Locomotive, Barba), `animation-components` (React Spring, Magic UI, AOS, Anime.js, Lottie), `authoring-motion` (Blender, Spline, Rive, Substance 3D), and `meta-skills` (integration patterns, modern design).
- Each skill is a `SKILL.md` (instructions/patterns) plus `references/`, `scripts/` (Python generators), and `assets/` (templates). Install via `/plugin marketplace add freshtechbro/claudedesignskills` then `/plugin install <name>`, or upload a skill `.zip` to claude.ai. Skills auto-activate when Claude detects a matching task; progressive disclosure keeps token cost low.
- **There is no public gallery of games/demos built specifically with this repo.** It's relatively new (marketplace launched 2025-11-13). Coverage is limited to install-directory listings (mcpmarket, claudemarketplaces, lobehub) and its own README/MARKETPLACE.md. So the practical research question is "what do the underlying tools do well for a mobile word game," which is where the real evidence lives.
- The repo's own skill content is concrete and game-useful. Notable confirmed contents:
  - **`react-three-fiber`**: `component_generator.py` scaffolds 12 R3F component types; teaches `useFrame`, `useThree`, Canvas `dpr={[1,2]}`, Rapier physics, drei helpers, and the rule "never `setState` inside `useFrame`."
  - **`gsap-scrolltrigger`**: `generate_animation.py` + `timeline_builder.py`; covers timelines, staggers, SplitText-style reveals, and a **Performance Best Practices** section (animate transform/opacity only, `will-change`, kill triggers on cleanup, `ScrollTrigger.matchMedia` for different mobile vs desktop animations).
  - **`rive-interactive`**: `component_generator.py` + `viewmodel_builder.py`; teaches state machines, Boolean/Number/Trigger inputs, `useStateMachineInput`, ViewModel data binding, and a **Performance Optimization** section (off-screen renderer, keep artboards <2MB, vectors over raster, preload).
  - **`react-spring-physics`**: `spring_generator.py` + `physics_calculator.py`; config presets (gentle/wobbly/stiff), `useTrail`, `useTransition`, velocity preservation, and `Globals.assign({ skipAnimation: true })` for reduced-motion.
  - **`motion-framer`** (Framer Motion / "Motion"): gestures (`whileTap`, `whileHover`, drag), `AnimatePresence` exit animations, layout animations, spring transitions, and `useReducedMotion`.

### 2. What people build with these tools that's relevant to a word/puzzle/quiz game
- **3D letter grids exist and are instructive but heavy.** *WORDL3D* (Wordle in 3D, by Ourcade) builds a grid of letter tiles in Three.js/R3F, generating 3D text from Typeface.js fonts, with outlines, orbit controls and React↔Three state sync. *coldi/r3f-game-demo* shows a tile-based grid game architecture in R3F (`useFrame` game loop, tile-based movement/collision). Wawa Sensei's R3F course even has a Hiragana/Katakana **character-learning game** using Rapier physics + 3D text + Zustand — directly analogous to letter cells.
- **Rive is the sweet spot for reactive game UI.** Rive powers production UI at Duolingo, Spotify, Disney; its state machines drive HUDs, health bars, buttons with hover/press/success states, and character mascots that react to app state. Files are tiny — Rive's docs state `.riv` files are "typically 10-15x smaller than equivalent Lottie files" (e.g. a 240KB Lottie recreated at 16KB), and Duolingo's Kurt Hartfelder reported (Oct 2022) that "his Rive test was 15x smaller than Lottie" — and GPU-accelerated. This is ideal for a **timer, a streak meter, and a reactive mascot** in a quiz.
- **"Juice" is the core concept for making simple games feel great.** The canonical examples: Peggle's "Extreme Fever" (fireworks + slow-mo + Ode to Joy) and Candy Crush's exploding candies. On the web, valdemird.com's "Game feel on the web" demonstrates a tap-streak loop where squash/stretch, particle multiplication, screen shake and rising audio pitch escalate by tier and decay when you stop — exactly the feedback loop a clue-race wants, and it explicitly gates effects behind `prefers-reduced-motion`.
- **Micro-interactions via Framer Motion / React Spring** are the standard for quiz feedback: `whileTap={{scale:0.97}}` on cells, spring "bounce" on correct entry, shake `x:[0,-10,10,-10,10,0]` on wrong answer, staggered reveals, and `AnimatePresence` for question-to-question transitions. Spring presets (wobbly/stiff) tune the "feel."
- **Head-to-head UI patterns** from real trivia-race games: *TriviaRacing* ("the track is the scoreboard" — correct answers drive a kart forward, wrong lets rivals close), *Trivia Race 3D*, QuizAx duels with 10-second timers. The reusable pattern is a **dual progress bar / shared race track** with live opponent position, per-question countdown, and speed bonuses for faster answers.

### 3. Techniques used by animated word/puzzle games (and mobile-friendliness)
- **Physics/spring on inputs** — spring scale/settle on letter entry (React Spring/Framer Motion). *Mobile-friendly.*
- **GSAP SplitText letter reveals** — per-character stagger, cube-flip, scramble/decode (great for revealing an answer or a clue). SplitText is now free in **GSAP 3.13** (per gsap.com/blog: "GSAP is now 100% FREE including ALL of the bonus plugins like SplitText, MorphSVG"), and was rewritten with ~50% smaller file size and built-in accessibility. *Mobile-friendly if you animate transform/opacity and avoid `filter: blur` on long strings.*
- **Particle feedback / confetti** — `canvas-confetti` (tiny, one function), `tsParticles` (confetti/fireworks components for React), or GSAP Physics2D confetti. *Mobile-friendly if particle counts are capped* (the Roblox-confetti cautionary note: 10,000 particles turns older iPhones into a slideshow).
- **Gyroscope / device-orientation parallax** — `react-parallax-tilt` (~3kB, zero-dep, built-in `gyroscope` prop and glare), parallax.js, tilt.js. Adds depth to tiles/cards. *Mobile-friendly but requires an explicit permission tap on iOS 13+ (`DeviceOrientationEvent.requestPermission`).*
- **Physics-based letter tiles in 3D** — WORDL3D-style. *Impressive but heavy on mobile.*
- **Shader / postprocessing effects (bloom, DoF)** — *Heavy; avoid or use sparingly on iPhone.*
- **Animated/morphing grids** — GSAP Flip plugin for state-to-state grid transitions; MorphSVG for shape morphs. *Flip is mobile-friendly (transform-based).*

### 4. Mobile-web / iPhone Safari performance rules
**WebGL / R3F budgets (if you use 3D at all):**
- Keep **draw calls under ~100–200** for a complex scene. The React Three Fiber "Scaling performance" docs state verbatim: "Each mesh is a draw call, you should be mindful of how many of these you employ: no more than 1000 as the very maximum, and optimally a few hundred or less." Use **InstancedMesh** to render many identical letter tiles in one draw call.
- Canvas config for mobile: `dpr={[1,2]}` (cap pixel ratio), `frameloop="demand"` (only render on change — huge battery win when the grid is static), `gl={{ antialias:false, powerPreference:'high-performance' }}`, `performance={{ min:0.5 }}` adaptive.
- Compress assets: **Draco** for geometry (90–95% smaller), **KTX2/Basis** textures (stay compressed on GPU, ~10x memory saving; a 200KB PNG can occupy 20MB+ VRAM). Use LOD (`<Detailed>`), texture atlases, and dispose geometries/materials/textures.
- A 45MB glTF crashes mid-range mobile Safari with a white screen — this is a real, documented failure mode. Profile with r3f-perf / Spector.js. **Instancing isn't always a win** — one developer reduced 300→56 draw calls and dropped from 60→35 FPS; measure before/after.
- Note: **WebGPU shipped in Safari 26.0 (released September 15, 2025)** and, per WebKit's WWDC25 blog, "is now shipping in Safari 26 beta for macOS, iOS, iPadOS, and visionOS"; it reached default availability across Chrome, Firefox, Safari and Edge by late November 2025. So the Three.js WebGPU renderer is now viable across major browsers, but WebGL remains the safe default for a puzzle game.
- **When to fall back:** For 2D visuals prefer **PixiJS** (WebGL/WebGPU 2D, auto Canvas fallback, ~120KB gzip, handles 1000+ sprites at 60fps) or **Rive** (vector, tiny) over Three.js. For "3D feel" without WebGL, use **CSS 3D transforms** (the repo's "3D Animations Studio"/modern-web-design approach: `perspective`, `preserve-3d`, flip cards, tilt) — far lighter than Three.js.

**iOS-specific gotchas:**
- **Audio must be unlocked on a user gesture.** Create/`resume()` a single `AudioContext` on first tap; reuse it (Safari allows only ~4 AudioContexts). Also: iOS won't play Web Audio if the ringer is on silent/vibrate.
- **Haptics:** Safari never shipped the standard Vibration API. The known hack (introduced with Safari 17.4) is an invisible `<input type="checkbox" switch>` with a `<label>`; programmatically firing the label emits haptic feedback (demonstrated by Jen Simmons' CodePen at codepen.io/jensimmons/pen/GReLKWg, cited in WebKit's release notes). **Important currency caveat: per the `tijnjh/ios-haptics` project, this behavior works iOS 17.4 through 26.4 and was patched out by Apple in iOS 26.5** — so treat web haptics on iPhone as a fragile progressive enhancement, not a dependency, and expect it to be unavailable on the latest iOS.
- **Prevent zoom/scroll:** use `touch-action`, `user-scalable=no` viewport (with care), `overscroll-behavior: none`, and set inputs to ≥16px font to stop Safari's auto-zoom-on-focus.
- **Lottie caution on mobile:** intricate Lotties can drop frames / tax CPU; Rive is 10–15x smaller and interactive. Prefer Rive for anything state-driven.

### 5. Prioritized, tool-mapped ideas for the crossword-clue battle

**Tier 1 — High ROI on mobile (do these first; low bundle/battery cost):**
1. **Spring-physics letter cells** — `react-spring-physics` (`useSpring`, wobbly preset) or `motion-framer` (`whileTap` scale + spring). Cells pop/settle on entry; wrong answer does a shake. Cheap, huge feel improvement.
2. **Correct-answer juice** — `canvas-confetti` or `tsParticles` burst at the solved clue + a Rive/CSS "checkmark draws in." Escalate intensity with streak (valdemird tier model). Cap particle counts.
3. **GSAP SplitText clue/answer reveals** — `gsap-scrolltrigger` (SplitText, now free in 3.13) for staggered letter reveals when a clue appears or an answer locks in. Transform/opacity only.
4. **Rive timer + reactive mascot/streak meter** — `rive-interactive` state machine with Number input (time), Boolean (isCorrect/isWrong), Trigger (celebrate). One tiny `.riv` handles the whole reactive HUD; drive it from React via `useStateMachineInput`.
5. **Head-to-head "race track" bar** — Framer Motion animated dual progress bar showing both players' clue completion in real time; per-question countdown; "opponent just answered!" pulse. Pure DOM/transform.
6. **Haptics on key events** (correct/wrong/win) via the iOS `<input type=checkbox switch>` hack + Vibration API on Android. Big perceived-quality boost, near-zero cost — but feature-detect and degrade gracefully (recall it is patched out in iOS 26.5).
7. **Question-to-question transitions** — `motion-framer` `AnimatePresence` slide/fade between clues; layout animations for the grid reshaping.

**Tier 2 — Medium effort, still mobile-safe:**
8. **Gyroscope tilt/parallax on cards** — `react-parallax-tilt` (gyroscope prop) for subtle depth on the clue card or win screen; gate behind the iOS motion-permission tap.
9. **CSS-3D flip reveals** — modern-web-design/"3D Animations Studio" skill: flip a cell to reveal a correct letter, or flip the whole card on win. No WebGL.
10. **Animated/morphing grid** — GSAP **Flip** for smooth layout changes (e.g., collapsing solved clues, reordering the race list).
11. **PixiJS particle/effect layer** — if you want richer, GPU-accelerated particles/shaders for the win screen while staying 2D.

**Tier 3 — Impressive but heavy (reserve for one hero moment, with 2D fallback + capability check):**
12. **3D letter tiles / WORDL3D-style grid** — `react-three-fiber` + drei + InstancedMesh, `frameloop="demand"`, `dpr={[1,2]}`. Consider only for a title screen or victory sequence, not the core solving surface.
13. **Spline hero object** — `spline-interactive` for a 3D trophy/mascot on the win screen. Beware: Spline scenes are the heaviest content type; a "simple" scene showed ~17.9s CPU time in one Lighthouse test. Lazy-load, add a poster image, or better, **export a compressed video/GIF** instead of the live runtime on mobile.
14. **Babylon.js / PlayCanvas full 3D** — overkill for this game; skip.

## Details

**Why the lightweight tools win here.** Your game's core loop is reading a clue and typing letters — a text-and-grid interaction. The "fun" comes from *feedback density* (juice), not from rendering a 3D world. Every credible source on game feel (valdemird, Brad Woods' "Juice" notes, the GameJuice library) says the wins are squash/stretch, particles, screen shake, sound, and haptics timed to events — all achievable in DOM/CSS/Canvas with Framer Motion, React Spring, GSAP and canvas-confetti at a fraction of WebGL's cost. Reserve WebGL for a single "wow" moment where the user isn't also trying to read and type.

**Rive deserves special emphasis.** It is the one tool in the stack purpose-built for *interactive, state-driven* UI that stays tiny and 60fps on budget phones. A single state machine can encode your timer, streak meter, correct/wrong reactions, and a Duolingo-style mascot, with the interaction logic living in the `.riv` file and React only setting inputs. The repo's `rive-interactive` skill gives Claude the exact `useRive`/`useStateMachineInput`/ViewModel patterns and mobile rules (off-screen renderer, <2MB artboards, vectors over raster, preload).

**Head-to-head specifically.** The strongest real-world pattern is *TriviaRacing*'s "the track is the scoreboard": convert progress into spatial motion so players feel the race. For a simultaneous clue-race, a shared horizontal track with two avatars/karts (or two fill bars) advancing per correct clue, plus a per-question timer and a speed bonus for faster correct answers, is proven and cheap to build with Framer Motion. Add an "opponent answered clue 4!" micro-pulse to create pressure.

**Performance discipline is the whole game on iPhone.** The recurring, well-documented failure is heavy WebGL/Spline assets white-screening or draining battery on mid-range iPhones. If you touch 3D: instancing, `frameloop="demand"`, `dpr` cap, Draco/KTX2, dispose on unmount, and always profile. If an effect can be done in 2D/vector/CSS, do it there. Always ship a `prefers-reduced-motion` path (React Spring's `Globals.assign({skipAnimation:true})`, Framer's `useReducedMotion`, GSAP matchMedia) — both for accessibility and to protect battery.

## Recommendations

**Stage 1 (this sprint — ship the "feel" layer, no WebGL):** Install the `animation-components` and `core-3d-animation` bundles so Claude can scaffold Framer Motion + React Spring + GSAP. Add: spring letter-cell entry, wrong-answer shake, `canvas-confetti` on solve, SplitText answer reveal, and the iOS haptics hack (feature-detected). Add `AnimatePresence` clue transitions. This alone transforms the "flat clue→cells" v1.

**Stage 2 (competitive layer):** Build the dual "race track" progress UI + per-clue countdown in Framer Motion, and add a Rive HUD (timer + streak + reactive mascot) via the `authoring-motion` bundle's `rive-interactive` skill. Wire sound through a single gesture-unlocked `AudioContext`.

**Stage 3 (one hero moment):** Add ONE heavier flourish — a CSS-3D or Tier-3 R3F victory sequence, OR a Spline/exported-video trophy — behind a device-capability check and a static fallback.

**Benchmarks / thresholds that change the plan:**
- Target **60fps** and **<16.7ms/frame** on your reference iPhone; if a feature can't hold it, cut or 2D-ify it.
- If any WebGL scene exceeds **~150 draw calls** or the glTF is more than a few MB, instance/compress or drop to 2D.
- If Time-to-Interactive on 4G exceeds a couple seconds because of a 3D runtime, replace the live scene with a poster+video.
- If confetti/particle bursts drop frames, cap particle count (start ~150–300, not thousands).
- Always ship the reduced-motion fallback before adding the next effect.

## Caveats
- **The repo is a code-generation aid, not a game engine or asset pack.** It makes Claude better at writing R3F/GSAP/Rive/etc. code; it does not itself contain crossword mechanics, and there is no verified public showcase of games built with it. Its quality for your purposes rests on the underlying libraries, which are mature and well-documented.
- Star/fork counts ("579 stars, 89 forks") and "27 plugins / 22 skills" come from the repo's own GitHub page and marketplace listings (self-reported); the marketplace launched Nov 2025 and is young.
- Some sources here are vendor/marketing pages (Rive's own site, tool blogs) — I've cross-checked capability claims against independent developer write-ups (Callstack's Lottie-vs-Rive benchmark, Poimandres/R3F docs, valdemird's game-feel demo) where possible.
- iOS haptics via the checkbox-switch hack is non-standard and **already fragile**: it works iOS 17.4–26.4 and was patched out in iOS 26.5, so a meaningful share of current iPhone users will get no haptics. Treat it as a nice-to-have, feature-detected enhancement.
- Two of the five skill files I most wanted to quote verbatim (`react-three-fiber`, `pixijs-2d` full bodies) could not be fully retrieved; their descriptions and key generator scripts are confirmed, but their complete pattern lists are corroborated from the underlying libraries' documentation rather than the SKILL.md text directly.