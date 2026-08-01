#!/usr/bin/env bash
# Runs at the end of every turn. Blocks completion if checks fail.
#
# Tolerant of an early-stage repo: if a check has nothing to run yet, it passes.
# Once real tests exist, failures block.

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

fail=0

if ls packages/*/tsconfig.json app/tsconfig.json >/dev/null 2>&1; then
  if ! npm run typecheck --silent; then
    echo "BLOCKED: typecheck failed."
    fail=1
  fi
fi

if grep -rqs '"test"' packages/*/package.json app/package.json 2>/dev/null; then
  if ! npm test --silent; then
    echo "BLOCKED: npm test failed."
    fail=1
  fi
fi

if ls factory/tests/test_*.py >/dev/null 2>&1; then
  if ! python -m pytest factory/tests -q; then
    echo "BLOCKED: pytest failed."
    fail=1
  fi
fi

# The UI gates. A screen that compiles is not a screen that works.
if [ -f tools/ui-verify/src/run.mjs ]; then
  if ! node tools/ui-verify/src/run.mjs --static; then
    echo "BLOCKED: the UI token or copy gate failed."
    fail=1
  fi
fi

if [ "$fail" -ne 0 ]; then
  echo "Fix the failures above before finishing. Do not report this phase as done."
  exit 2
fi

exit 0
