# Lesson video brief: Google Flow (Veo). For Shlok and Aryan to generate (not done through a CLI)

Source prompts: docs/research/13-training-hub.md §7. P0 needs **2 lessons**. Each lesson is 4 clips of
about 8 s (assumed native clip length; verify in Flow) stitched into a 45-60 s lesson. The English
voice-over is replaced later by Sarvam Hindi audio, so **generate the clips without dialogue**
(ambient sound only).

## Step 1: paste this into ChatGPT to refine the prompts
> You are a film director writing Google Flow (Veo) prompts for industrial safety training clips
> for Indian heavy-equipment operators. Rewrite each shot below into one production-ready Veo prompt
> (subject, action, setting, lighting, camera, lens, mood, ambient audio, 8 seconds, 16:9). Keep the
> CONSISTENCY LOCK identical in every prompt. Obey the NEGATIVE list. No spoken dialogue. No on-screen text.

## CONSISTENCY LOCK (copy into every prompt)
- **Operator "Ravi":** Indian man, about 28, slim, short black hair, trimmed moustache. White hard
  hat, fluorescent orange hi-vis vest with silver reflective stripes over a navy work shirt, brown
  safety boots, grey work gloves.
- **Machine:** a mid-size tracked hydraulic excavator in **muted mustard-amber** with a matte
  charcoal counterweight. Unbranded plain panels, rectangular grille, no logos, no lettering, no
  stripes.
- **Site:** an open stone quarry in central India, pale dusty ground, terraced rock faces, scattered
  scrub. Late-morning sun, heat haze.
- **Look:** realistic documentary cinematography, natural colour, 35 mm, shallow depth of field on
  close-ups.

## NEGATIVE (copy into every prompt)
No Caterpillar or any brand logo or wordmark, no "CAT" text, no bright school-bus yellow, no red
diagonal stripe, no hexagon grille, no text overlays, no subtitles, no people without PPE (unless
the shot requires it), no unsafe behaviour shown as correct, no cartoon or CGI look.

## Lesson 1: "Seatbelt on slopes" (demo step 2, and the Loop lesson)
1. **Hook:** a wide shot of the excavator parked on a gentle quarry ramp. Ravi walks up and climbs
   the steps using three points of contact. Slow dolly-in.
2. **Rule:** inside the cab, medium shot through the open door. Ravi sits, pulls the seatbelt across
   and clicks it in, and only then reaches for the controls. Close-up on the buckle clicking.
3. **Why:** wide shot of the machine tracking slowly up the ramp, which tilts noticeably. Low angle
   emphasising the slope and the cab height. Tense ambient engine sound.
4. **Close:** close-up of Ravi, belted, calm and focused, hands on the joysticks, the machine
   steady on the slope. Warm light. Slow push-in.

Hindi voice-over (Sarvam, added later): hook "ढलान पर मशीन…" → rule "पहले सीट बेल्ट, हर बार।" →
why "ढलान पर पलटने का खतरा सबसे ज़्यादा होता है।" → close "बेल्ट लगी है, तभी मशीन चलेगी।"
(A native speaker checks this text before recording.)

## Lesson 2: "Faulty machine nearby" (demo steps 3-4, the Replay companion)
1. **Hook:** a wide shot of the quarry yard. In the background, a second identical excavator has an
   amber rotating beacon flashing on its cab roof, and faint white mist sprays from a hydraulic line
   near its boom. Ravi walks in the foreground, on foot.
2. **Rule, stop:** medium shot. Ravi stops mid-stride, looks toward the flagged machine and raises
   a hand in a stop gesture. The background machine is in soft focus.
3. **Rule, move away:** tracking shot. Ravi walks briskly away, upwind and uphill along the
   terrace, glancing back once, keeping a wide distance.
4. **Close, report:** close-up. Ravi, at a safe distance, lifts a phone or handheld radio to his
   ear; the beacon is small and blurred far behind him. Calm resolve.

Hindi voice-over: "पास की मशीन में खराबी? रुकिए।" → "पास मत जाइए।" → "हवा की उल्टी दिशा में,
ऊपर की ओर दूर जाइए।" → "सुपरवाइज़र को तुरंत सूचना दीजिए।" (A native speaker checks this.)

## Deliverables (put in `apps/web/public/media/lessons/`)
- `seatbelt-slope-s1.mp4` … `-s4.mp4`, `faulty-nearby-s1.mp4` … `-s4.mp4` (16:9, 1080p if
  available).
- One poster frame (JPG) per lesson.
- Stitching and captions are done in the app (P0) or in any editor. Keep each lesson under 60 s.

## P1 (only if time allows)
- The walk-around clip (research 13 §7 #1) for "Spot the Hazard".
- The proximity-while-reversing clip (#5).
