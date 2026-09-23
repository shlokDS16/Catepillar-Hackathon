# UI/UX framework (from Shlok via ChatGPT, 2026-09-23)

> **Status: guidance, not law.** Shlok's directive 14: do not follow it blindly. Functionality,
> button types and action sequences follow OUR approved plan (docs/specs/idea.md). Ignore any folder
> structure it implies. Shlok's later instructions have the highest priority.
> Content below is kept near-verbatim (formatting condensed).

## 0. Master philosophy
Build a minimal, intelligent operator experience, not a conventional dashboard and not an animated
showcase. Distinctive through hierarchy, typography, interaction, composition and purposeful motion,
not visual excess. Every element earns its place. Every button has a defined purpose and a
predictable action sequence. Every animation communicates something. Every visual asset is
intentional. Every screen works for remote/operational use. Multilingual from the beginning. Works
without animation. When in doubt, simplify. Adapt continuously to Shlok's newer instructions while
preserving minimalism, usability, consistency, purposeful motion and interaction integrity.

## 1. Core design philosophy: minimalism first, distinction second
Should feel: industrial, calm, precise, trustworthy, modern, human-designed, easy to operate
remotely, visually distinctive without being flashy.
Should NOT feel like: a generic SaaS dashboard, an AI-generated landing page, a sci-fi interface,
a portfolio site, or an over-animated Dribbble concept.
Rule: if removing an element does not reduce understanding or functionality, remove it (buttons,
cards, labels, icons, animations, decorative graphics, nav items, secondary info).

## 2. Remote-work usability is the priority
Optimise for clarity under imperfect conditions: not sitting at a big monitor, divided attention,
variable network, needing to spot a safety issue quickly, laptop/tablet screens, at-a-glance reading.
Priority order: **Current task → safety → machine state → action → secondary information.**

## 3. Interface hierarchy (establish before building components)
- L1 Immediate safety / critical machine state
- L2 Current task / what needs to happen now
- L3 Progress / ETA / operational status
- L4 Recommendations / anomalies / insights
- L5 History / training / analytics
- L6 Secondary settings / supporting information

## 4. Motion is restrained: only when it improves comprehension or feedback
Appropriate: safety state transition (CLEAR → PROXIMITY ALERT), subtle progress transitions
(58% → 64% → 72%), smooth view transitions, subtle indication of remote state updates.
Avoid: constant floating, heavy parallax, spinning objects, bouncing cards, animated backgrounds,
particles, continuous gradients, animation on every button, exaggerated page transitions.
Rule: the operator should notice the information, not the animation.

## 5. One signature interaction
Instead of ten wow effects, make one memorable one. For example, the machine's operational state
as the central visual element:
```
        EXC-001
     ● OPERATIONAL
   ────────────────
      EXCAVATION
         72%
   ETA        SAFETY
  18 MIN      CLEAR
```
It responds subtly to task progress, safety state and current activity. That is the visual
identity; everything else stays restrained.

## 6. Multilingual from the beginning
Language selector (for example EN / हिन्दी / मराठी / தமிழ் — final set decided by the plan).
No containers that only work in English (no fixed-width buttons); translated text must expand.
Covers navigation, task labels, safety alerts, buttons, instructions, training, notifications,
errors and confirmations. Icons support text and never replace it, especially for safety.

## 7. Button and action minimisation protocol
Before any button, answer: the user goal; is a button needed; can an existing interaction do it;
is the label unambiguous; what happens on click; on failure; can the user undo; is the state correct.
Every button has an **action contract**, for example:
```
BUTTON: "Log Incident"
PURPOSE: Create a new safety incident.   VISIBLE WHEN: user on an active machine/task.
ON CLICK: open incident capture.         NEXT: select type → confirm → submit.
SUCCESS: incident appears in timeline.   FAILURE: actionable error.
DUPLICATE PREVENTION: block repeat submit. AFTER: return to current task.
DO NOT: multiple buttons for the same action.
```

## 8. One action → one predictable sequence
Safety alert: ALERT → View → Understand → Acknowledge → Resolve / escalate → Recorded.
Never: alert → 5 buttons → random modal → another screen → unclear state.

## 9. Button states explicitly defined
Default, Hover, Pressed, Disabled, Loading, Success, Error; where relevant: Requires confirmation,
Already completed, Unavailable, Offline, Permission restricted.

## 10. A single interaction map (docs/design/interaction-map.md), updated with every new interaction
```
Navigation: Home, Current Task, Safety, Training, History
Actions: Start Task, Pause Task, Complete Task, Log Incident, Acknowledge Alert, Open Training
States: Safe, Warning, Critical, Offline, Completed
```
Prevents duplicate actions, inconsistent labels, dead buttons, conflicting flows, navigation loops,
mismatched modals and different names for the same action.

## 11. No unnecessary screens
Ask whether the information can be understood within the current context. For example, Current Task
contains Progress, ETA, Weather and Machine state, rather than four screens.

## 12. Anti-AI visual rules (hard constraint)
Never: purple/blue AI gradients, excess neon, glassmorphism, floating glass cards, robot imagery,
random futuristic machinery, holograms, meaningless 3D, glowing particles, decorative data streams,
excessively rounded cards, stock-photo collages, generic AI avatars.
Prefer: real industrial imagery, restrained typography, a strong grid, authentic textures, real
machine references, purposeful charts, controlled colour, clear hierarchy, whitespace, subtle movement.

## 13. Figma is a controlled reference
Figma provides approved design information only. It never overrides the product direction, never
auto-redesigns existing components, and never introduces new patterns without approval. Never
generate a whole UI from a Figma interpretation in one pass: build one primary experience,
validate it, then expand.

## 14. Build sequence
01 Read problem → 02 Understand operator → 03 Define experience → 04 Propose 2–3 UI directions →
05 Shlok selects/modifies → 06 Visual language → 07 Primary screen → 08 Validate →
09 Interaction map → 10 Core flow → 11 Secondary features → 12 Restrained motion →
13 Multilingual → 14 Responsive refinement → 15 Button/flow audit → 16 Visual QA →
17 Final simplification.

## 15. Final simplification (reduction pass), mandatory
For every screen, button, animation, card, nav item, text and visual: can it be removed or said more
clearly? Finish with less UI than the first version.

## 16. Tools
Use the minimum tools required. Prefer approved assets. Never introduce a tool-generated visual just
because a tool is available. (Figma = controlled reference; browser preview for inspection; image
generation only for specifically requested assets.)
