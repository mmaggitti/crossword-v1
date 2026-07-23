# §11 Colour scheme — green-led instantiation (operative extract)

Extract of the user's own design-system document, covering what the app is built against. The full source — including Appendix A, which records the derivation, the gamut measurements, and every departure from the recipe — lives in Mark's vault. **Ask for it before making a substantive palette change**; A.3 in particular explains the green-on-green collision this app works around.

Brand primary **P = `#076B3B`**, measured at CIE L\* 39.4 · C\* 42.9 · h 152.6° — a dark, blue-leaning emerald.

---

## Role architecture

Colour is defined by **roles, not hues**. Any brand can instantiate these roles.

| Role group | Job |
|---|---|
| Accent ramp (5) | The single brand hue family. `accent`: primary actions, the one live element, emphasis. `deep`: hover/pressed. `deepest`: anchors, pull quotes. `soft`: tint panels, secondary structure. `softest`: callout and highlight backgrounds |
| Neutrals (6) | `ink` primary text · `muted` secondary/labels/scaffolding · `border` dividers and rules · `surface` dense-content background · `surface-subtle` low-glare zones · `canvas` the warm quiet field |
| Status trio (3) | Conventional green / amber / red, as pastel fills paired with black text |
| Data pack (~14) | Even-lightness pastel wheel for categorical data. **The brand hue is deliberately absent** so data colour never competes with the accent |

## Behaviour rules — these survive any palette swap

- **Default field:** light canvas, near-black body text, one accent for emphasis or the single active element.
- **The focal budget:** one accent "live" element per unit — audit it. One primary action per view. One highlighted series per chart.
- **The accent never means good or bad.** State always speaks through the status trio. The accent marks emphasis, structure, interaction, and *now*.
- **Status and data colours are fills, not text.** Pastel fills always pair with black text or strokes — never coloured text on white.
- **Secondary colours never frame pages** and never become persistent identity coding.
- **The grayscale test:** if the unit still reads clearly with colour removed, the usage is disciplined enough.
- **Task vs measurement:** task progress fills with the accent (it is "live"); threshold measurements fill with status colours — never the accent.

## Contrast gates (hard)

- White text on `accent` ≥ 4.5:1 — this palette measures **6.61:1**, so primary actions stay on `accent`
- `accent` on white ≥ 3:1 for UI/graphic elements — **6.61:1**
- Black text on `soft` / `softest` ≥ 7:1 — **9.99:1** and **16.09:1**
- Black text on every data hue ≥ 8:1

Because the accent clears 4.5:1 on white in both directions, it is also legal as body-weight text on white.

---

## Tokens

### Accent ramp — all hold h ≈ 152.6° (max drift 0.7°)

| Role | Hex | L\* | Notes |
|---|---|---|---|
| `accent` | `#076B3B` | 39.4 | White text = 6.61:1 |
| `accent-deep` | `#034D29` | 28.1 | Hover / pressed / supporting contrast |
| `accent-deepest` | `#01341A` | 18.1 | Anchors, pull quotes, selected headers |
| `accent-soft` | `#6BC58C` | 72.9 | Tints, secondary structure. Also the dark-mode substitute |
| `accent-softest` | `#CDE8D4` | 89.6 | Callout/highlight backgrounds, quiet tints |

### Neutrals — warm column (the recommended default)

| Role | Hex |
|---|---|
| `ink` | `#000000` |
| `muted` | `#818180` |
| `border` | `#CFCFCF` |
| `surface` | `#FFFFFF` |
| `surface-subtle` | `#F1F1EF` |
| `canvas` | `#FBF9F4` |

A cool alternative column exists (`#EBF0EC` / `#F4FAF5`). **Pick one and hold it** — the cool column reads more clinical and weakens the cream/forest pairing.

### Status trio — pastel fills, black text

| Role | Hex | Note |
|---|---|---|
| `status-ok` | `#B8DAAE` | Leaf green, shifted −15.6° from the accent. **This app does not use it** — see below |
| `status-warn` | `#F2CE9E` | |
| `status-danger` | `#F2B0B0` | |

### Dark mode — declared but not exposed in this app

| Role | Hex |
|---|---|
| `surface` | `#000000` |
| `surface-subtle` | `#141414` |
| `ink` | `#FFFFFF` |
| `muted` | `#A6A6A5` |
| `border` | `#2A2A2A` |

**The rule the green needs that the purple did not:** `accent` `#076B3B` scores 3.18:1 on `#000` and 2.79:1 on `#141414`. It is legal as a large graphic mass on pure black and **illegal everywhere else on dark** — never as text, never as a stroke or icon on `surface-subtle`. On dark, **promote the accent to `accent-soft` `#6BC58C`** (9.99:1 / 8.76:1). A dark-only saturated state accent `#24F790` exists for the single live element on a dark field; it fails the light-mode gate and must never appear on light.

Implementing dark mode means implementing the promotion rule, not just swapping the neutrals.

---

## Where this app departs, and why

**`status-ok` is unused.** §11.2 forbids the accent meaning good or bad, so correctness must speak through the status trio. But `status-ok` Leaf sits only 15.6° from the accent, and Appendix A.3 names the failure case exactly: *small swatches — legend chips, table-cell fills, 12px status dots.* A crossword cell is precisely that swatch, and a correct-green fill would sit adjacent to an active-green cursor. **Resolution: mark only wrong cells.** Correct cells stay `surface`, so the collision never gets a chance to fire.

If positive correctness marking is ever wanted, A.3's fallback is to push `status-ok` to h ≈ 131 (`#BED9AB`) — and that should be decided at the token level, not in this app.

**The solved state uses the accent.** §11.2 assigns task progress to the accent and reserves status colours for threshold measurements. A finished puzzle is a completed task — but it is also unmistakably "good", which the accent is not supposed to signal. The two rules pull against each other; the task reading won. The alternative is a neutral banner on `surface-subtle` with `ink` text.

**Three accent-family elements coexist** — cursor cell, clue pill, Check button. Read as one live element per unit (grid / clue / actions), which satisfies the focal budget, but it is more green than the spec's default posture. The user has explicitly said this is deliberate and he wants to keep it.
