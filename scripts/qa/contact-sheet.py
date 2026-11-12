"""Contact sheet and verdict for scroll-audit.sh.

python scripts/qa/contact-sheet.py <outdir> <width> <height>

Reads <outdir>/frames.jsonl and f-NN.png, writes contact.png (dead frames boxed in red) and
report.md, and exits 1 if any frame is dead (no readable words), thin (under 10 words) or visually flat (pixel standard
deviation under 22, i.e. a near-solid colour screen such as an ink wipe held too long).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageStat

out, w, h = Path(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
frames = [json.loads(l) for l in (out / "frames.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]

cols, tw = 4, 360
th = round(tw * h / w)
rows = (len(frames) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * (th + 20)), "white")
d = ImageDraw.Draw(sheet)
lines, bad = ["| # | y | words | flat | verdict | first text |", "|---|---|---|---|---|---|"], 0
for f in frames:
    i, p = f["i"], f["probe"]
    img = Image.open(out / f"f-{i:02d}.png").convert("RGB")
    sd = sum(ImageStat.Stat(img.convert("L")).stddev)
    flat, dead, thin = sd < 22, p["words"] == 0, p["words"] < 10
    verdict = "DEAD" if dead else ("FLAT" if flat else ("THIN" if thin else "ok"))
    bad += verdict != "ok"
    x, y = (i % cols) * tw, (i // cols) * (th + 20)
    sheet.paste(img.resize((tw, th)), (x, y + 20))
    d.text((x + 4, y + 4), f"{i:02d} y={p['y']} {verdict} w={p['words']}", fill="red" if verdict != "ok" else "black")
    if verdict != "ok":
        d.rectangle([x, y + 20, x + tw - 1, y + 20 + th - 1], outline="red", width=4)
    first = (p["text"][0] if p["text"] else "").replace("|", "/")
    lines.append(f"| {i} | {p['y']} | {p['words']} | {sd:.0f} | {verdict} | {first} |")
sheet.save(out / "contact.png")
gl_file = out / "webgl.txt"
gl = gl_file.read_text().strip() if gl_file.exists() else "unknown"
summary = f"{len(frames)} frames at {w}x{h}, {bad} dead, thin or flat (WebGL: {gl})"
(out / "report.md").write_text(f"# Scroll audit\n\n{summary}\n\n" + "\n".join(lines) + "\n", encoding="utf-8")
print(summary)
sys.exit(1 if bad else 0)
