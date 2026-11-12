#!/usr/bin/env bash
# Scroll audit: walks a page in fixed scroll steps with agent-browser (vercel-labs), records what a
# visitor can actually read in each frame, and fails if any frame is "dead" (nothing readable).
#
#   bash scripts/qa/scroll-audit.sh <url> <outdir> [width] [height] [step-px]
#   HEADED=1 runs a visible browser so WebGL is real (headless Chromium usually has none, which
#   means only the no-WebGL fallback gets audited). The report states which path was audited.
#
# Writes <outdir>/f-NN.png per frame, <outdir>/frames.jsonl (one line per frame), and, via
# contact-sheet.py, <outdir>/contact.png plus <outdir>/report.md. Exit 1 when a dead frame exists.
# A frame is DEAD with no readable words (text >= 14px, effective opacity >= 0.5), THIN under 10.
# Fixed chrome (nav bar, SIM caption, scroll rail) does not count: tag it data-chrome or set CHROME.
set -euo pipefail
URL="${1:?url}"; OUT="${2:?outdir}"; W="${3:-1440}"; H="${4:-900}"; STEP="${5:-450}"
mkdir -p "$OUT"; : > "$OUT/frames.jsonl"
S="scroll-audit-$$"
# Fixed chrome that is on screen in every frame and so says nothing about the frame itself.
CHROME="${CHROME:-[data-chrome],[aria-hidden=true],.l-sr,noscript,script,style,.l-nav,.l-caption,.l-hint,.l-rail,.l-foot-note}"
# The daemon occasionally drops a reply (os error 10060); retry each call up to three times.
FLAGS=(); [ "${HEADED:-0}" = 1 ] && FLAGS+=(--headed)
ab() { local n; for n in 1 2 3; do agent-browser "${FLAGS[@]}" --session "$S" "$@" && return 0; sleep 2; done; return 1; }
trap 'ab close >/dev/null 2>&1 || true' EXIT

ab set viewport "$W" "$H" >/dev/null
ab open "$URL" >/dev/null
ab wait 2500 >/dev/null
GL=$(ab eval '(() => { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); })()' | tr -dc "a-z")
echo "$GL" > "$OUT/webgl.txt"

PROBE='(() => {
  const CHROME = "'"$CHROME"'";
  const vh = innerHeight, out = [];
  const eff = (n) => { let o = 1; for (; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === "hidden" || cs.display === "none") return 0; o *= parseFloat(cs.opacity); } return o; };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let words = 0;
  for (let t; (t = walker.nextNode()); ) {
    const s = t.textContent.replace(/\s+/g, " ").trim(); if (s.length < 2) continue;
    const el = t.parentElement; if (!el || el.closest(CHROME)) continue;
    const r = el.getBoundingClientRect(); if (r.bottom <= 0 || r.top >= vh || r.width === 0) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize); const o = eff(el);
    if (fs < 14 || o < 0.5) continue;
    // Occlusion: text painted under another layer (e.g. a fixed footer behind the page) is not seen.
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + Math.min(r.width, 40) / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    const hit = document.elementFromPoint(cx, cy); if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) continue;
    words += s.split(" ").length; if (out.length < 6) out.push(s.slice(0, 48));
  }
  return JSON.stringify({ y: Math.round(scrollY), docH: document.documentElement.scrollHeight, words, text: out });
})()'

i=0; y=0
DOCH=$(ab eval 'document.documentElement.scrollHeight' | tr -dc '0-9')
while [ "$y" -lt "$DOCH" ]; do
  ab eval "window.scrollTo(0,$y)" >/dev/null
  ab wait 700 >/dev/null
  n=$(printf '%02d' "$i")
  ab screenshot "$OUT/f-$n.png" >/dev/null
  line=$(ab eval "$PROBE" | sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g')
  echo "{\"i\":$i,\"probe\":$line}" >> "$OUT/frames.jsonl"
  i=$((i + 1)); y=$((y + STEP))
done

python "$(dirname "$0")/contact-sheet.py" "$OUT" "$W" "$H"
