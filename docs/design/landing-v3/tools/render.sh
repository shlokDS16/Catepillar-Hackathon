#!/usr/bin/env bash
# Render a landing-v3 mockup to PNG at 1440x900 and 375x812 with agent-browser.
#   bash tools/render.sh <name> [full]   (name = mockups/<name>.html; "full" = full-page capture)
set -euo pipefail
cd "$(dirname "$0")/.."
N="$1"; FULL="${2:-}"
U="file:///$(cygpath -m "$PWD/mockups/$N.html" 2>/dev/null || echo "$PWD/mockups/$N.html")"
ab() { agent-browser --session v3mock "$@"; }
for vp in "1440 900" "375 812"; do
  set -- $vp
  ab set viewport "$1" "$2" >/dev/null
  ab open "$U" >/dev/null
  ab wait 1200 >/dev/null; ab eval "document.fonts.ready.then(()=>document.fonts.size)" >/dev/null; ab wait 1500 >/dev/null
  if [ -n "$FULL" ]; then ab screenshot --full "png/$N-$1.png" >/dev/null; else ab screenshot "png/$N-$1.png" >/dev/null; fi
  echo "png/$N-$1.png"
done
