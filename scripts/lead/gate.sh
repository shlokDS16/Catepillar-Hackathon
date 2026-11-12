#!/usr/bin/env bash
# Lead merge gate: merge a lane branch into main, run every web check, push only if all pass.
# Usage: gate.sh <lane-branch> "<merge message>"
set -u
M="C:/Users/Shlok/Downloads/Catepillar Hackathon"
B="$1"; MSG="$2"
cd "$M" || exit 2
git fetch -q origin "$B" || { echo "GATE: fetch failed"; exit 2; }
OUT=$(git diff --name-only main...origin/"$B" | grep -v -E '^(apps/web/|supabase/|scripts/|packages/shared/|docs/)')
[ -n "$OUT" ] && echo "GATE: files outside known areas:" && echo "$OUT"
DEPS=$(git diff main...origin/"$B" -- apps/web/package.json packages/shared/package.json package.json | grep -E '^[+-] ')
[ -n "$DEPS" ] && echo "GATE: dependency changes:" && echo "$DEPS"
if ! git merge --no-ff -q origin/"$B" -m "$MSG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"; then
  echo "GATE: MERGE CONFLICT, aborting"; git merge --abort; exit 3
fi
fail=0
pnpm install --frozen-lockfile --silent >/dev/null 2>&1 || { echo "GATE: install failed"; fail=1; }
pnpm --filter web typecheck >/dev/null 2>&1 && echo "typecheck ok" || { echo "GATE: typecheck FAILED"; fail=1; }
pnpm --filter web lint >/dev/null 2>&1 && echo "lint ok" || { echo "GATE: lint FAILED"; fail=1; }
T=$(pnpm --filter web test 2>&1 | grep -E "Tests ")
echo "web tests: $T"
if echo "$T" | grep -q failed; then
  T2=$(pnpm --filter web test 2>&1 | grep -E "Tests ")
  echo "web tests rerun: $T2"
  echo "$T2" | grep -q failed && { echo "GATE: tests FAILED twice"; fail=1; } || echo "GATE WARNING: flaky test (failed once, passed on rerun)"
fi
if git diff --name-only HEAD~1 HEAD | grep -q -E '^(packages/shared|scripts)/'; then
  pnpm exec tsc -p packages/shared/tsconfig.json --noEmit >/dev/null 2>&1 && echo "shared tsc ok" || { echo "GATE: shared tsc FAILED"; fail=1; }
  pnpm exec tsc -p scripts/tsconfig.json --noEmit >/dev/null 2>&1 && echo "scripts tsc ok" || { echo "GATE: scripts tsc FAILED"; fail=1; }
  S=$(pnpm exec vitest run packages/shared scripts 2>&1 | grep -E "Tests ")
  echo "shared+scripts tests: $S"; echo "$S" | grep -q failed && { echo "GATE: shared/scripts tests FAILED"; fail=1; }
fi
pnpm --filter web build 2>&1 | grep -q "Compiled successfully" && echo "build ok" || { echo "GATE: build FAILED"; fail=1; }
if [ "$fail" -ne 0 ]; then
  echo "GATE: NOT PUSHED. Undo with: git -C \"$M\" reset --hard ORIG_HEAD (merge commit $(git rev-parse --short HEAD))"
  exit 1
fi
git push -q origin main && echo "GATE: PUSHED $(git log --oneline -1)"
