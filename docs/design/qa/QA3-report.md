# QA3 re-run (wave 2 fixes, commit 6796725) on https://spotter-five-brown.vercel.app

Method: Playwright, 375 / 360 / 1440 (note: at "1440" the landing capture was ~1265 px wide because the shared browser window was resized by another session). Replay reached by direct URL /op/training/replay/qa3 (fixture replayGet ignores the id); the /director Beat 4 click was denied by the permission classifier, so it was not used. Hindi set with the NEXT_LOCALE cookie (the language sheet's Hindi button was not clickable in my run). SOS never touched.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | Map marker keyboard focus ring, /op/map 1440 | PASS | Tab onto .map-marker: :focus-visible true, ::after box-shadow `paper 1px + ink 4px` (double ring), transparent 3px outline. QA3-op-map-focus-1440.png shows the ring on "You . EXC-007" |
| 1b | Map marker focus ring, /fm/map 375 | PASS | Same computed ring on "EXC-014, Fault, Simulated, 8 s ago". QA3-fm-map-focus-375.png |
| 2a | Debrief recording moves, 375 | PASS | Restart then sampled: TIME 0:00 / 0:15 / 0:30 / 0:45 / 1:00 of 2:00, speed 0.0 -> 3.2 -> 4.3 -> 5.6 km/h, pitch 3.0 -> 15.7 deg. QA3-debrief-375.png |
| 2b | Debrief recording moves, 1440 | PASS | TIME 1:13 -> 1:36 over 2.5 s at 10x, speed 4.3 -> 2.2 km/h, seatbelt On/Off changes. QA3-debrief-1440.png |
| 2c | Plain score labels | PASS | Labels seen: "Safety", "How you worked", "Speed"; section "2 of 3 decisions right". No "Ideal", "Efficiency", "Right steps" anywhere on the page (en 375 and 1440) |
| 3a | Landing stage 3 counters, 375 (en) | PASS | "14 CYCLES / 620 TONNES MOVED" render cleanly, 5 .l-dg groups each 21x44 px, one row, no overlap. QA3-landing-stage3-375.png |
| 3b | Landing stage 3 counters, wide (en) | PASS | "14 / 620" render cleanly beside the headline. QA3-landing-stage3-1440.png (viewport ~1265 px) |
| 3c | Landing stage 3 in Hindi, 375 | PASS | Copy and labels in Hindi ("चक्कर", "टन माल हटाया"); digits render. QA3-landing-stage3-hi-375.png |
| 4a | Hindi Debrief (full), 1440 and 375 | PASS | All headings, scores ("सुरक्षा", "आपने कैसे काम किया", "तेज़ी"), "3 में से 3 फ़ैसले सही", steps and rule in Hindi; only the literal "10x" speed chip, numerals and units Latin. QA3-debrief-hi-1440.png, QA3-debrief-hi-375.png |
| 4b | Hindi /fm/ledger | PASS | Entry types in Hindi (PPE नहीं पहना, बहुत पास, सीटबेल्ट नहीं लगा, तेज़ रफ़्तार). Raw operator/machine ids remain (known not-done in track-f). Latin token SPOTTER-LEDGER is the literal Telegram message tag |
| 4c | Hindi /op/map and /fm/map | PASS | Text all Hindi (simulated = नकली throughout); only map attribution and codes (EXC-014) Latin. QA3-op-map-hi-360.png, QA3-fm-map-hi-360.png |
| 5 | No horizontal scroll at 360 | PASS | scrollWidth 345 vs innerWidth 360 on /, /op/map, /fm/map, /fm/ledger, /op/training/replay (Debrief, hi). At 1440 scrollWidth 1425 (scrollbar). |
| 6 | Console errors | PASS | 0 errors on all routes. 3 MapLibre style warnings (highway-shield filter null) on map routes, third-party tile style, not from the fixes |

Not covered: /op/safety does not contain the map markers directly (it only offers "Open site map"), so the map check used /op/map and /fm/map. Open-Meteo source line (provenance.tsx) and the Weather evidence card in Hindi were not individually inspected. Debrief Hindi at 360 text only checked via overflow, not re-screenshotted.

Environment note: another session shares this Playwright browser and twice navigated or resized my tab (once to http://localhost:3192/op); results above were re-taken after each interference.

Totals: 12 PASS, 0 FAIL.
