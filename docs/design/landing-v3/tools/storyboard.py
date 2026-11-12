"""Landing v3 storyboard: which stage, which beat and which readable words are on screen at every
audit step. Mirrors scripts/qa/scroll-audit.sh (450 px at 1440x900, 406 px at 375x812).
Prints markdown tables used in docs/design/landing-v3-spec.md section 5.

Pinned stage model (as landing-engine.tsx): a stage of height H has a sticky 100svh pin; p = (y - top) /
(H - vh). After its travel the pin scrolls out while the next stage's pin scrolls in. Flow blocks are
ordinary sections; we report which block covers most of the viewport.
"""

# v3 model (spec 3.2): S1-S5 share ONE sticky scene viewport (canvas + copy column + tape). Their
# sections are scroll bands (vh). After S5 the scene holds while the S6 paper slides over it (100vh).
BANDS = {
    "desk": {"vh": 900, "step": 450, "scene": [("S1", 70), ("S2", 200), ("S3", 200), ("S4", 220), ("S5", 160)],
             "after": [("pin", "S6", 180), ("pin", "S7", 240), ("flow", "Footer", 980)]},
    "phone": {"vh": 812, "step": 406, "scene": [("S1", 30), ("S2", 140), ("S3", 140), ("S4", 160), ("S5", 110)],
              "after": [("flow", "S6 head", 420), ("flow", "S6 rows", 560), ("flow", "S6 verdict", 320), ("flow", "S7 head", 330),
                        ("flow", "S7 operator", 800), ("flow", "S7 fleet", 800), ("flow", "S7 auditor", 800), ("flow", "Footer", 1010)]},
}

RANGES = {"S1": (360, 380), "S2": (380, 440), "S3": (440, 620), "S4": (630, 660)}
# Tape lines in clock minutes (spec 3.3). Ledger entries carry their number.
LINES = [(360, "06:00 Shift opens on Bench 3"), (372, "06:12 EXC-07 moves to the dig face"),
         (380, "06:20 Digging. Boom and stick read live"), (392, "06:32 Seatbelt off while moving (entry 1)"),
         (401, "06:41 Seatbelt on. Back to clear"), (416, "06:56 No signal. 2 events held on the machine"),
         (428, "07:08 Signal back. 2 events sent"), (440, "07:20 Loading the first truck"),
         (485, "08:05 Idle too long, 11 min (entry 2)"), (530, "08:50 Overspeed on the ramp (entry 3)"),
         (630, "10:30 Haul truck on the ramp"), (644, "10:44 Proximity warning (entry 4)"),
         (655, "10:55 Truck backs out. Clear"), (725, "12:05 Slope alert (entry 5)"),
         (800, "13:20 Seatbelt off (entry 6)"), (840, "14:00 Shift closed")]

def clock(stage, p):
    """Shift clock shown on the tape, minutes after 00:00."""
    lerp = lambda a, b, t: a + (b - a) * max(0, min(1, t))
    if stage in RANGES: return lerp(*RANGES[stage], p)
    if stage == "S5":
        if p < 0.55: return lerp(660, 644, p / 0.55)          # replay: the clock runs back to the event
        return lerp(660, 840, (p - 0.55) / 0.45)              # then fast-forwards to the end of the shift
    return 840

def line_at(m, replay=False):
    if replay: return f"REPLAY {hhmm(m)}, entry 4 (practice)"
    cur = LINES[0][1]
    for t, txt in LINES:
        if m >= t: cur = txt
    return cur

def hhmm(m):
    m = int(round(m)); return f"{m // 60:02d}:{m % 60:02d}"

def beat(stage, p, phone):
    """(visual, readable copy outside the tape, approx words, tape now-line)."""
    if stage == "S1":
        now = line_at(clock("S1", p))
        vis = "hero 3/4 low angle, first light" if p < 0.35 else "camera pulls back over the benches"
        return vis, "H1 + sub + 2 CTAs", 35, now
    if stage == "S2":
        cs = 1 + (p >= 0.25) + (p >= 0.45)
        now = line_at(clock("S2", p))
        return f"orbit close on the machine, dig cycle, {cs} callout(s) with leaders", f"title + body + readout (boom, stick, bucket, phase, link) + {cs} callout(s)", 34 + 5 * cs, now
    if stage == "S3":
        cyc = round(14 * min(1, p / 0.85)); t = round(620 * min(1, p / 0.85))
        now = line_at(clock("S3", p))
        return f"high oblique, trail drawn to {min(100, round(100 * p / 0.85))} %", f"title + body + stats {cyc} cycles / {t} t (SIM)", 30, now
    if stage == "S4":
        if p < 0.12: d, st = 41, "CLEAR"
        elif p < 0.3: d, st = 24, "CLEAR"
        elif p < 0.45: d, st = 15, "CAUTION"
        elif p < 0.62: d, st = 9.8, "WARNING"
        elif p < 0.8: d, st = 7.4, "WARNING"
        elif p < 0.9: d, st = 16, "CAUTION"
        else: d, st = 29, "CLEAR"
        now = line_at(clock("S4", p))
        return f"45 deg oblique, rings, truck at {d} m", f"title + body + 4-state legend + readout {d} m {st}", 40, now
    if stage == "S5":
        if p < 0.55:
            return "trail rewinds with the machine to the 10:44 event, replay card", "card: title + body + scrub + practice chip", 38, line_at(clock("S5", p), True)
        return "canvas dims toward 60 % ink, trail ghosted (never solid)", "card stays (readable over the dim)", 38, line_at(clock("S5", p))
    if stage == "S6":
        rows = max(0, min(6, round((p - 0.05) / 0.05)))
        state = "chain broken at row 4" if p >= 0.7 else "chain verified" if p >= 0.4 else "rows stamping"
        return f"paper sheet, {rows}/6 rows, {state}", "title + body + rows (time, type, severity, hash)", 40 + 6 * rows, "14:00 Shift closed"
    if stage == "S7":
        role = "Operator /op" if p < 0.34 else "Fleet manager /fm" if p < 0.67 else "Auditor /fm/ledger"
        return f"framed capture: {role}", "title + lede + 3 role rows (all visible, one active)", 70, "(tape hidden)"
    return "", "", 0, ""

def flow_beat(name):
    return {
        "S6 head": ("paper", "S6 title + body + status chip", 40, "14:00 Shift closed"),
        "S6 rows": ("paper, rows stamp on view", "6 ledger rows", 48, "14:00 Shift closed"),
        "S6 verdict": ("paper, row 4 flagged", "chain broken at row 4 + row 4 note", 22, "(tape hidden)"),
        "S7 head": ("paper", "S7 title + lede", 20, "(tape hidden)"),
        "S7 operator": ("capture /op (phone)", "Operator role text + CTA", 24, "(tape hidden)"),
        "S7 fleet": ("capture /fm (phone)", "Fleet manager role text + CTA", 20, "(tape hidden)"),
        "S7 auditor": ("capture /fm/ledger (phone)", "Auditor role text + CTA", 20, "(tape hidden)"),
        "Footer": ("ink, contour wordmark", "footer columns + 14:00 closure line", 60, "(tape hidden)"),
    }[name]

def table(kind):
    cfg = BANDS[kind]; vh, step = cfg["vh"], cfg["step"]
    bands = []; y = 0
    for name, h in cfg["scene"]:
        H = h * vh / 100; bands.append((name, y, H)); y += H
    overlay_start = y                      # S6 paper top enters the viewport bottom here
    blocks = []; y = overlay_start + vh    # S6 section top in document coordinates
    for kind_, name, h in cfg["after"]:
        H = h * vh / 100 if kind_ == "pin" else h
        blocks.append((kind_, name, y, H)); y += H
    doc = y
    out = ["| # | y | stage, p | visual | readable copy (outside the tape) | ~words | tape |", "|---|---|---|---|---|---|---|"]
    i, fy = 0, 0
    while fy < doc - 1:
        yy = min(fy, doc - vh)
        if yy < overlay_start:
            for name, top, H in bands:
                if top <= yy < top + H: break
            p = (yy - top) / H
            vis, copy, w, now = beat(name, p, kind == "phone")
            out.append(f"| {i} | {int(yy)} | {name} p={p:.2f} | {vis} | {copy} | {w} | {now} |")
        elif yy < overlay_start + vh:
            cover = yy - overlay_start
            v2, c2, w2, n2 = beat("S6", 0, False) if blocks[0][0] == "pin" else flow_beat(blocks[0][1])
            out.append(f"| {i} | {int(yy)} | paper rises ({int(cover)} px of {vh}) | S5 scene held (60 % ink) above a rising paper sheet | S5 card (upper) + {c2} (on the sheet) | {38 + w2} | 14:00 Shift closed |")
        else:
            for kind_, name, top, H in blocks:
                if top <= yy < top + H: break
            if kind_ == "pin":
                travel = H - vh; p = (yy - top) / travel
                if p <= 1:
                    vis, copy, w, now = beat(name, p, False); where = f"{name} p={p:.2f}"
                else:
                    off = yy - top - travel; nxt = blocks[blocks.index((kind_, name, top, H)) + 1]
                    vis0, copy0, w0, now = beat(name, 1, False)
                    v2, c2, w2, n2 = beat(nxt[1], 0, False) if nxt[0] == "pin" else flow_beat(nxt[1])
                    where = f"{name}->{nxt[1]} ({int(off)} px)"; vis = f"paper scrolls on: {vis0} leaves at top, {v2} enters"
                    copy = f"{copy0} (top) + {c2} (bottom)"; w = max(w0, w2); now = now if off < vh / 2 else n2
            else:
                vis, copy, w, now = flow_beat(name); where = name
            out.append(f"| {i} | {int(yy)} | {where} | {vis} | {copy} | {w} | {now} |")
        i += 1; fy += step
    return f"Document height {int(doc)} px, {i} frames.\n\n" + "\n".join(out)

if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    print("### 1440 x 900, 450 px steps\n"); print(table("desk")); print("\n### 375 x 812, 406 px steps\n"); print(table("phone"))
