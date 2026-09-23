# Visual language: Direction A "Site Signage"

- Status: design plan v1 (ui-ux-lead, 2026-09-23). Direction A was chosen by Shlok (spec v3 §9). C "Console" is the P1 night theme.
- Sources: docs/design/ui-framework.md (guidance), docs/research/14-field-ux.md §2-6, spec v3.
- Verified today: every font below returned HTTP 200 from the Google Fonts CSS2 API at the listed weights. Barlow and Barlow Condensed include the `tnum` (tabular figures) OpenType feature in the Latin subset (checked with fontTools).

## 0. Five rules

1. **Safety colour means live state and nothing else.** Yellow, orange, red and green never decorate, never brand and never label a button. If a colour is on screen, something is in that state now.
2. **Colour + pictogram + word, every time.** No state is shown by colour alone. Roughly 8 % of men are red-green colour-blind, and the screen may be in glare.
3. **A plate with a thick rule.** Modules are rectangular plates with near-zero radius and 2-3 px ink rules, like stencilled site signs. There are no shadows, gradients, glass or glow.
4. **One loud thing per screen.** The state word is the largest text on any screen. Nothing else competes with it.
5. **Built for a glove and the sun.** Light default, ink on warm paper, touch targets of at least 15 mm, body text of at least 18 px for operators.

## 1. Colour

### 1.1 Roles (light theme, the default)

| Token | Hex | Role | Never used for |
|---|---|---|---|
| `--paper` | `#F2F0EA` | App background (warm off-white, cuts glare) | |
| `--surface` | `#FBFAF6` | Plates, sheets, inputs | |
| `--surface-sunk` | `#E6E3DA` | Pressed state of outline buttons, table header, the selected segment | |
| `--ink` | `#16150F` | Text, heavy rules, **primary buttons (the only action "accent")**, focus ring | |
| `--ink-2` | `#4B483F` | Secondary text, units, labels | Body copy in Simple mode |
| `--ink-3` | `#6B675D` | Meta text (timestamps, "assumed" tag), disabled label | Anything the operator must act on |
| `--rule-soft` | `#CFCBC0` | Hairline dividers inside a plate (decorative only) | Control borders (fails 3:1) |
| `--state-clear` | `#0B6B37` | CLEAR / OK / chain verified (ISO 3864 safe condition) | Success toasts, "done" ticks |
| `--state-caution` | `#FFC700` | CAUTION tier (ANSI Z535 yellow) | Brand, highlights, the hero background |
| `--state-warning` | `#FF6A00` | WARNING tier (ANSI Z535 orange) | Primary buttons |
| `--state-critical` | `#B3102A` | CRITICAL tier, SOS, chain broken (ANSI/ISO red) | Form errors, delete buttons |
| `--state-mandatory` | `#1B4F9C` | Required PPE pictograms only (ISO 7010 M-series blue) | Links, buttons, focus |
| `--state-nosignal` | `#5E5A50` | NO SIGNAL / stale state plate | |
| `--on-ink` | `#FFFFFF` | Text on ink, clear, critical, mandatory and no-signal plates | |
| `--on-signal` | `#16150F` | Text on caution and warning plates (signage convention: black on yellow/orange) | |

Decisions:
- **The primary-action colour is ink.** A black plate with white text reads like a stencilled sign, beats any hue for contrast, and keeps all four safety hues free for state. Direction A's "one accent hue" is ink.
- **System errors are not red.** A failed network call is shown with ink, a ✕ pictogram and the word "Error", never with `--state-critical`. This keeps red rare enough to mean danger (EEMUA 191: at most ~5 % of alarms are top priority).
- **No yellow as a brand colour.** Caterpillar's trade dress is yellow and black. Yellow appears only when something needs caution, and the hazard-stripe motif uses ink and paper, not yellow and black.
- **Safety colours are always a filled plate with a 2 px ink border,** never text on paper. Yellow and orange on paper fail the 3:1 non-text contrast rule (1.37 and 2.52). The ink border fixes that, and it is also how physical signs are drawn.
- **Live vs replay:** inside a Replay simulation, hazards are drawn as ink outlines, never filled with safety colour. Filled safety colour always means *now*.

### 1.2 Contrast (WCAG 2.2, computed with the relative-luminance formula)

| Pair | Ratio | Result |
|---|---|---|
| ink on paper / on surface | 16.05 / 17.51 | AAA |
| ink-2 on paper / on surface | 8.02 / 8.75 | AAA |
| ink-3 on paper / on surface | 4.95 / 5.40 | AA (meta text only) |
| ink on surface-sunk | 14.25 | AAA |
| white on ink | 18.29 | AAA |
| ink on caution `#FFC700` | 11.69 | AAA |
| ink on warning `#FF6A00` | 6.37 | AA (AAA at ≥ 24 px bold) |
| white on critical `#B3102A` | 6.94 | AA (AAA at ≥ 24 px bold) |
| white on clear `#0B6B37` | 6.62 | AA (AAA at ≥ 24 px bold) |
| white on mandatory `#1B4F9C` | 7.94 | AAA |
| white on no-signal `#5E5A50` | 6.88 | AA |
| Non-text: critical / clear / mandatory / no-signal plate vs paper | 6.09 / 5.81 / 6.97 / 6.03 | ≥ 3:1 |
| Non-text: caution / warning plate vs paper | 1.37 / 2.52 | Fails alone, so **every state plate has a 2 px ink border** |
| Ink button edge on a critical plate | 3.03 | ≥ 3:1 (just); keep the ink button ≥ 64 px so the edge is never the only cue |

**Daylight target.** WCAG AA is the floor. Everything an operator reads at a glance (state word, safety field, alert plate text, button labels) is ≥ 6:1 and ≥ 24 px bold. The lowest glance pair is ink on orange at 6.37:1. Rejected alternatives: pure white `#FFFFFF` as the background (glare) and `--ink-3 #77736A` (4.15:1, fails AA).

### 1.3 Night theme (P1, Direction C "Console")
All tokens are semantic, so the night theme only redefines them under `[data-theme="console"]`. It is not built in P0. It is switched deliberately, never by `prefers-color-scheme`, because a phone set to dark mode in daylight would otherwise lose sunlight readability.

## 2. Typography

### 2.1 Families (all on Google Fonts, loaded with `next/font/google`)

| Family | Weights loaded | Use |
|---|---|---|
| **Barlow Condensed** | 600, 700, 800 | State words, big numerals (%, ETA, distance), chip words. Its design comes from highway signage, which is the signage idea in type form. `tnum` for numerals that update. |
| **Barlow** | 400, 500, 600, 700 | Latin UI text: body, labels, buttons |
| **Noto Sans Devanagari** | 400, 600, 800 | Hindi (and Marathi in P1) |
| **Noto Sans Tamil** | 400, 600, 800 | Tamil |
| `ui-monospace` (system, not downloaded) | | Hashes in the ledger only, grouped in 4s |

Font stacks. Latin digits and Latin words inside Hindi or Tamil sentences render in Barlow, so numerals look the same in every language:
```
--font-body:    "Barlow", "Noto Sans Devanagari", "Noto Sans Tamil", system-ui, sans-serif;
--font-display: "Barlow Condensed", "Noto Sans Devanagari", "Noto Sans Tamil", system-ui, sans-serif;
```
Loading: `display: "swap"`; preload Barlow and Barlow Condensed plus the active locale's Noto only (`preload: false` for the other script). Subsets: `latin` for Barlow, `["devanagari","latin"]`, `["tamil","latin"]`.

### 2.2 Scale (operator = Simple mode; supervisor = Detailed mode)

| Token | Latin (size / line-height / weight) | Devanagari & Tamil | Detailed mode | Use |
|---|---|---|---|---|
| `--t-state` | clamp(56px, 14vw, 96px) / 0.95 / 800 condensed, uppercase | 0.85× size / 1.25 / 800 | same | Hero state word, alert takeover word, motion-lock word |
| `--t-figure` | 48px / 1.0 / 700 condensed, `tnum` | same digits (Barlow) | 40px | Progress %, ETA minutes, distance |
| `--t-title` | 26px / 1.2 / 700 | 26px / 1.45 / 600 | 22px | Screen and plate titles |
| `--t-body` | 18px / 1.45 / 500 | 18px / 1.6 / 400 | 16px | All operator text |
| `--t-label` | 18px / 1.2 / 600 | 18px / 1.45 / 600 | 16px | Buttons, chips, nav |
| `--t-meta` | 15px / 1.35 / 500 | 15px / 1.5 / 400 | 13px | Timestamps, "assumed", "as of 10:42" |

Rules:
- **Minimum operator text is 15 px.** 13 px appears only in Detailed mode (supervisor on a laptop).
- `text-transform: uppercase` for Latin state words and chip words only. Indic scripts have no case, and nothing else is uppercased.
- `:lang(hi), :lang(ta) { letter-spacing: 0 }`. Tracking breaks the Devanagari headstroke and Tamil conjuncts.
- Indic line-height is higher (1.25 display, 1.6 body). The research found no authoritative ratio, so QA each script visually (frontend task F21).
- Numbers are formatted with `Intl.NumberFormat` using the active locale. `hi-IN` and `ta-IN` default to Latin digits, which is what Indian apps use. Rupees use Indian grouping (₹1,30,000). Times are 24 h ("14:00").

## 3. Space, shape and size

- **Spacing scale (4 px base):** `--s-1 4` · `--s-2 8` · `--s-3 12` · `--s-4 16` · `--s-5 24` · `--s-6 32` · `--s-7 48` · `--s-8 64`.
- **Gutters:** 16 px below 640 px, 24 px from 640 px, 32 px from 1024 px. Content max width 1200 px. No horizontal scroll at 360 px.
- **Radii:** `--r-0: 0` for plates, buttons, sheets and the hero. `--r-1: 2px` for text inputs only. Circles appear only in ISO-shaped pictograms and in the Guardian rings on the map.
- **Rules:** `--bw-heavy 3px` (hero, alert plates, SOS), `--bw 2px` (buttons, state plates, inputs), `--bw-hair 1px` (`--rule-soft`, table rows).
- **Elevation:** none. Layering is shown with a 3 px ink rule on the top edge of sheets and takeovers, not with shadows.
- **Motif:** a 45° ink/paper hazard stripe, 8 px band, used **only** on the motion-lock frame. Nowhere else.

### 3.1 Touch targets (glove sizing)

| Token | CSS px | Physical size | Applies to |
|---|---|---|---|
| `--hit` | **80 px** min in both dimensions | ≈ 15 mm on a phone | Every operator control: nav items, chips, list rows, buttons |
| `--hit-sos` | **108 px** square | ≈ 20 mm on a phone | SOS, Acknowledge on Warning/Critical plates |
| `--hit-dense` | 48 px | ≈ 9 mm | Detailed mode on ≥ 1024 px only (supervisor at a desk, no gloves) |
| `--hit-gap` | 24 px | ≈ 4.5 mm | Minimum gap between adjacent operator targets |

Conversion: Google's Android guidance equates 48 dp (≈ 48 CSS px on phones) with about 9 mm, so 1 px ≈ 0.19 mm. Research 14 §2 says "15 mm ≈ 56-64 dp". That is an arithmetic slip (64 dp ≈ 12 mm), so this document uses 80 px. On a 96-dpi laptop 80 px is ≈ 21 mm. That is large, but still fine.

## 4. Pictograms

- **Six safety pictograms drawn by us**, in the manner of ISO 7010 signs but not copied from it: seatbelt, proximity (person + machine), PPE vest, hydraulic/fault, heat, SOS/help. Each is drawn inside its sign shape: a triangle for caution and warning, a circle for mandatory PPE, an octagon for critical. Stroke is 2.5 px at 24 px.
- UI icons (nav, mic, camera, map) come from **lucide-react** (ISC licence; check at install). Stroke 2 px, 28 px in the nav, always paired with a label.
- No machine photography of Cat-branded equipment and no Cat marks. Machine types are shown as flat line silhouettes (excavator, loader, dozer).

## 5. Motion

Motion is feedback, never decoration. The operator should notice the information, not the animation.

| Token | Value | Used for |
|---|---|---|
| `--dur-0` | 0 ms | **Safety state changes.** The chip, hero safety field and alert takeover change instantly. A plate caught halfway between orange and red is ambiguous, so it never tweens. |
| `--dur-press` | 80 ms | Button press (surface darkens, 2 px inset top rule) |
| `--dur-stamp` | 480 ms, once | When the tier **rises**, the plate's ink border expands 3→8→3 px **once**. It never loops. |
| `--dur-value` | 320 ms | Progress % and ETA figure tween (58 → 64 %), progress bar width |
| `--dur-view` | 160 ms | Screen change: cross-fade only, no slide |
| `--dur-sheet` | 200 ms | Bottom sheets: fade + 24 px rise |
| `--ease` | `cubic-bezier(0.2, 0, 0, 1)` | Everything except timers |
| linear | | Countdown bars (escalation, SOS cancel window), the SOS hold fill |

Allowed continuous motion: the SOS hold fill (while held), escalation countdown bars, and an indeterminate loading bar that appears only after a 300 ms wait. Nothing else moves on its own: no pulsing chips, no animated radar, no looping alert flash. Vibration and audio do the attention-getting.

**`prefers-reduced-motion: reduce`:** every duration becomes 0. The SOS hold fill and the countdown bars become stepped (updated once per 250 ms or 1 s), because they are feedback, not decoration. Vibration and audio are unaffected.

### 5.1 Simulation carve-out (Replay and lessons only)
Inside `/training/replay/*`, a larger motion budget is allowed:
- trail playback (the operator's GPS trail drawn over 5-8 s, machine markers moving);
- a decision timer bar;
- a choice reveal (right/wrong plate slides in, 240 ms);
- step transitions (240 ms slide);
- a score count-up of at most 1.2 s.

Still banned: confetti, particles, bounce, looping idle animation. The carve-out stops at the replay frame. The persistent chrome stays static, and **a live Warning or Critical alert pauses the replay and takes over the screen**, because safety beats training.

## 6. Tailwind 4 mapping
Tokens live in one file, `apps/web/src/styles/tokens.css`, as CSS custom properties. `@theme` maps them (`--color-ink`, `--color-state-critical`, `--spacing-hit`, …), so components use `bg-state-critical`, `min-h-hit` and so on. No hex values appear in components. The same file is the source for the Expo tokens in P2.
