#!/usr/bin/env bash
# Captures the three product screens the landing's proof section shows, from a running build of the
# app on demo data, and encodes them as avif + webp (each at most 90 KB) into apps/web/public/landing/.
#
#   bash scripts/qa/capture-proof.sh [base-url] [locale]       (default http://localhost:3210, en)
#
# Output: proof-{op,fm,ledger}[-m][-hi].{avif,webp}. Desktop is captured at 1440 x 1020 and cropped to
# 1320 x 825 (the app rail goes; on /op the yellow status band goes too, so no large caution-yellow
# surface sits in the frame). Phone is captured at 390 x 844 and cropped to 390 x 520 (header and dock go).
# It only navigates and takes screenshots: it never clicks, never presses a key, and never opens
# /api/sos-demo. Needs agent-browser (vercel-labs). Encoding uses the sharp that ships with next.
set -euo pipefail
BASE="${1:-http://localhost:3210}"; LOC="${2:-en}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/apps/web/public/landing"
TMP="$(mktemp -d)"
S="capture-proof-$$"
ab() { local n; for n in 1 2 3; do agent-browser --session "$S" "$@" && return 0; sleep 2; done; return 1; }
trap 'ab close >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
SUF=""; [ "$LOC" != "en" ] && SUF="-$LOC"

shoot() { # name route width height tag
  ab set viewport "$3" "$4" >/dev/null
  ab open "$BASE$2" >/dev/null
  if [ "$LOC" != "en" ]; then ab eval "document.cookie='NEXT_LOCALE=$LOC; path=/'" >/dev/null; ab open "$BASE$2" >/dev/null; fi
  ab wait 2500 >/dev/null
  ab screenshot "$TMP/$1$5.png" >/dev/null
}
for spec in "op:/op" "fm:/fm" "ledger:/fm/ledger"; do
  name="${spec%%:*}"; route="${spec#*:}"
  shoot "$name" "$route" 1440 1020 ""
  shoot "$name" "$route" 390 844 "-m"
done

SHARP="$(cd "$ROOT/apps/web" && node -e "console.log(require.resolve('sharp',{paths:[require.resolve('next/package.json')]}))")"
SHARP="$SHARP" TMP="$TMP" OUT="$OUT" SUF="$SUF" node -e '
const sharp = require(process.env.SHARP), fs = require("fs"), path = require("path");
(async () => {
  for (const f of fs.readdirSync(process.env.TMP).filter((x) => x.endsWith(".png"))) {
    const base = f.replace(/\.png$/, ""), src = path.join(process.env.TMP, f);
    const CROP = { op: [120, 186, 1320, 825], fm: [120, 0, 1320, 825], ledger: [120, 0, 1320, 825], "op-m": [0, 116, 390, 520], "fm-m": [0, 118, 390, 520], "ledger-m": [0, 110, 390, 520] }[base];
    const [left, top, width, height] = CROP;
    const img = () => sharp(src).extract({ left, top, width, height });
    for (const [ext, opts] of [["webp", (q) => ({ quality: q, effort: 6 })], ["avif", (q) => ({ quality: q, effort: 6 })]]) {
      let q = 80, buf;
      for (; q >= 30; q -= 5) { buf = await img()[ext](opts(q)).toBuffer(); if (buf.length <= 90 * 1024) break; }
      fs.writeFileSync(path.join(process.env.OUT, "proof-" + base + process.env.SUF + "." + ext), buf);
      console.log("proof-" + base + process.env.SUF + "." + ext, (buf.length / 1024).toFixed(1) + " KB (q" + q + ")");
    }
  }
})();
'
