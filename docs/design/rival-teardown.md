# Rival teardown: "Cat Operator Assistant" (localhost:5811)

Captured 2026-11-12 at 1440x900 and 375x812. Plain JS, three.js (global build, `physicallyCorrectLights`, `outputEncoding`), lucide, no framework, no build. Source read: `app.js` (181 KB), `data.js`, `machine3d.js`, `live.js`. Screenshots in `docs/design/qa/rival/`. Nothing on the rival was changed.

## 1. Feature inventory (screen by screen)

| Screen / state | What it does | Shot |
|---|---|---|
| Login, "Who is driving?" | 3 operator cards (Intermediate / Expert / Beginner chips, licence class) plus a "Fleet manager" entry. Hazard-stripe CAT side panel, 3-step rail. | 01-login-who |
| Login PIN, then belt gate | 4-digit pad (demo PIN printed on screen), "scan ID badge" shortcut, then a **start interlock**: engine button stays locked until a demo belt toggle is on; a blocked start is logged as an incident. Optional walk-around chips. | (flow in `showLogin()`, ends at 03) |
| Home (operator) | Full-bleed 3D excavator stage; 6 projected hotspots (cab, engine, boom, bucket, undercarriage, sensors) with a live-value card and connector line; "Your pace" ghost card (you vs personal best); seatbelt card; **Today's shift replay** (scrubbable 08:00-18:00 bar, 1x/2x/4x, pause, Now). | 03, 05, 06 |
| Home, 3D drag | Yaw-only drag with damped spring back. | 04 |
| Home, replay scrub | Dragging the bar rewrites pace, belt card and hover tag. | 07 |
| Home, idle pit-stop | In a long idle the replay shows a "Short video for you" card chosen by cause (belt off gives a safety video, else a fuel video). | 18 |
| My tasks, Today | Now / Next / Shift-left cards, auto re-plan banner (weather vs job), job list with Done stepper and "running late +15", Add job. | 08-tasks |
| My tasks, Job time | Planned vs predicted minutes (multiplier model: skill x weather x age), planner error vs model error. | 08-tasks-time |
| Safety | Site warning cab preview (All clear / Slow / Stop / Give way) with a full-screen colour edge glow; radar "who is near you" (stop 6 m, slow 10 m); site conditions table; SOS explainer. | 08-safety, 14 |
| Safety, Reports | Incident list, 1-sec hold-to-report voice note, severity, status. | 08-safety-reports |
| Learn, Controls | Top-down cab illustration with 10 numbered controls; tap gives text plus a matching Cat video. | 09-training |
| Learn, Videos / Habits | Real Cat YouTube links with "why for you" lines; 5-shift habit trends with sparklines and chips (normal / worth a look / concerning). | 09-training-videos, 09-training-habits |
| Machine | Health score per part, hydraulics gauge with limit line, 10-shift reading charts, "Call the mechanic". | 09-machine |
| Profile / Settings | Licences, F1 progress, warning points; English/Hindi, haptics, voice, contrast, offline toggle. | 10-settings |
| SOS | Hold 1.5 s; red modal with a 5-step checklist that ticks in sequence. | 11b-sos-overlay |
| Drive lock | "Parked/Moving" demo switch; moving locks the UI behind an animated side-view excavator with only Report and SOS. | 12-drive-lock |
| Night mode | Full dark theme, 3D exposure and shadow retuned. | 13-night-mode |
| Hindi | Nav, titles, sub-tabs translate; body copy does not. | 14 |
| Fleet manager | 4 KPIs, review queue (Talk / Dismiss), waiting-time lines, reports per day, fuel bars, plan-vs-real; filters by operator, machine, dates. | 15-fleet-manager |
| Mobile 375 | 3D stage on top, hotspot card below, drawers for menu and telemetry, no horizontal scroll. | 16, 17 |
| Not present | No chat or AI assistant despite the name; no map; no real-time stream (`live.js` is an off-by-default in-page stub). | n/a |

## 2. What it does better than a typical dashboard

**3D machine (`machine3d.js`).** Fully procedural, no glTF: extruded bevelled shapes, cylinders for wheels and rams, `TubeGeometry` hoses, textured plane decals. Materials: `MeshPhysicalMaterial` paint (clearcoat 0.6, roughness 0.34), chrome rods (metalness 1, roughness 0.07), glass at 0.42 opacity with clearcoat. Lighting: ACES filmic tone mapping (exposure 0.95, 0.85 at night); a **homemade studio environment** (gradient sphere plus three softbox planes, baked once with `PMREMGenerator` into `scene.environment`); hemisphere fill 0.6; one 2048 px PCF-soft shadow key (2.2) and a rim light; a `ShadowMaterial` floor (opacity 0.26 day / 0.55 night). Camera: FOV 26 (long-lens product look), hero 3/4 framing shifted with `setViewOffset` so the machine sits in the free area between controls and replay panel; on phones it fits measured vertex bounds. Loop: sine sway around a base yaw; drag adds a damped offset that decays x0.9 per frame; `prefers-reduced-motion` freezes it.

**Live data drives the model through emissive glow, not labels.** Part-tagged meshes get cloned materials; per frame a faulty part pulses red (emissive 0.22 to 0.55 at 3.2 rad/s), the selected part breathes yellow, warn parts pulse softly. A fault is visible on the machine itself. Hotspots are real DOM buttons repositioned every frame from `Vector3.project()`; a connector line animates from the X button to the hotspot with a cubic ease-out.

**Time as the core interaction.** One scrubbable shift bar rewrites the whole screen. `frame()` advances a time cursor and everything is a pure function `stateAt(t)`. This is what makes static data feel alive.

**Copy and density.** Short imperative copy ("Stop now: a person is inside your stop zone", "Waited 60 min, only 1 load"); every number has a unit and a reference ("2:59 SLOWER than your best of 47 min, 12 Apr, in rain"). Comparison is against the operator's **own** baseline, which feels fair. Condensed display type reads like signage.

**Micro-interactions.** Hold-to-confirm rings on SOS and Report; PIN dots shake on a wrong PIN; "Locked: belt off" start button; per-level edge-glow vignette; count-up numbers; sequential SOS checklist; custom dropdowns; pre-paint theme script; staggered "rise" entrances via `--i`.

## 3. Weaknesses (our openings)

- **Honesty of data.** "Live" is a 4-row CSV plus hard-coded samples. SOS claims "Supervisor A. Singh told / medic 4 minutes away" with nothing sent. The only disclosure is a small "sample data" note on the fleet page; the PIN is printed on screen. Scrubbed to 10:54, the belt card still reads "Live / BELT ON since 10:42 / 71%" while the bar says belt off 10:38-12:00 (shot 07).
- **State leaks.** The replay hover tag stays stuck ("10:38 to 12:00 Site prep, belt off") over every other page (shots 08, 09); the red edge glow persists into the fleet view (15); the fleet view still carries operator SOS and EXC001 chrome; "Talk to operator" only fires a toast.
- **Accessibility.** Canvas is `aria-hidden`, no keyboard orbit or text alternative for 3D state; about 90 aria attributes and 8 roles across 2.5k lines; Hindi covers only chrome, so body copy stays English, and Devanagari headings clip (14); 10-11 px grey captions.
- **Performance.** The rAF loop never pauses on tab hide (no `visibilitychange` or IntersectionObserver anywhere); hotspot transforms and a 2048 shadow map every frame; renderer disposed and rebuilt on each Home visit; Google Fonts and YouTube thumbnails need a network.
- **Model quality.** Pale washed-yellow body against a saturated orange boom (a fault tint on a different mesh), milky glass; stylised, not convincing. Yaw-only drag, no zoom or pitch.
- **Trade-dress and licence.** CAT logo on every screen and as a 3D decal, `#FFCD11`/black hazard stripes, official Cat videos. Its own header says "viewing only; no copying, reuse." We must not copy code or assets.
- **No intelligence.** The name says assistant; there is no chat, voice input, map, live location or cross-machine view.

## 4. "Take it to another level" for Spotter (ranked by wow per effort)

Constraint: no Caterpillar marks or yellow-black; operator screens stay high-contrast Site Signage; spectacle lives in the landing page and Replay.

1. **Time-scrub Replay that rewrites the whole app.** One `stateAt(t)` cursor drives the map, Guardian rings, alert timeline and Debrief numbers; scrub bar with alert ticks and a hover tag. *Replay Brief/Investigate/Decide.* Low-medium effort; their best idea, with real incident data behind it.
2. **Fault glow on the 3D machine.** Per-part cloned material with a red/amber emissive pulse driven by alert state. *Landing hero and Replay Investigate;* Home hero card gets a flat SVG version (no WebGL) that pulses the same part. Low.
3. **Studio environment instead of an HDR file.** Gradient sphere plus 3 softboxes through `PMREMGenerator`, ACES, FOV 26, `ShadowMaterial` floor, view-offset framing. Zero assets, premium look. *Landing.* Low.
4. **Honest provenance chip everywhere.** Every number tagged Live / Replayed / Simulated with age ("3 s ago"). Attacks their biggest flaw. *Home hero, Ledger, Analytics.* Low.
5. **Alert takeover with edge glow and a one-line cause.** Their vignette idea, but ours says what, where, what to do, escalates amber to red, and honours reduced-motion. *Alert takeovers.* Low.
6. **Own-baseline comparison.** "2:59 slower than your best, 12 Apr, in rain"; compare to the operator's history, not a fleet average. *Home hero card, Debrief.* Low-medium.
7. **SOS that tells the truth.** Hold ring plus a checklist that ticks only on real acknowledgements (sent, received, supervisor seen, ETA) with timestamps. Beats their fake confirmation. *SOS hold.* Medium.
8. **Map and 3D handshake.** Click a MapLibre machine marker, a 600 ms camera ease into a mini 3D card, Guardian rings as ground-plane `RingGeometry`. *Map, Replay.* Medium.
9. **Fleet-manager Inbox that acts.** "Talk to operator" opens a prefilled message, assigns an owner, writes to Ledger. *Inbox, Ledger.* Medium.
10. **Decide as a ghost run.** In Replay Decide, preview the alternative decision as a translucent ghost track beside the actual one, with delta minutes and risk. *Replay Decide/Debrief.* Medium-high; strong judge moment.
11. **Cinematic landing scroll story.** Scroll maps to a lerped camera dolly, site rings sweep, fault glow ignites mid-scroll; lazy-load three.js, pause on `visibilitychange`, static poster fallback. *Landing.* Medium-high.
12. **Contextual drive lock.** Auto-reduce Home to Report/SOS only above a speed threshold and show the next hazard ahead; theirs is a demo toggle with a cartoon. *Home.* Low-medium.
13. **Real bilingual EN/HI** including alerts and spoken warnings, Devanagari line-height fix. Exposes their half-translation. *Alert takeovers, SOS, Home.* Medium.
14. **"Ask Spotter" strip.** Grounded answers over the day's ledger ("why did I get that alert?") citing alert IDs. They have no assistant at all. *Home, Debrief.* Medium-high.
15. **Performance and a11y as a pitch feature.** Keyboard orbit and a text alternative of 3D state, visibility pause, small first paint on operator screens. *All.* Low-medium.

**Do not copy:** hazard stripes, the condensed-yellow palette, the cab-from-above illustration, official video content, or any code from their licensed files.
