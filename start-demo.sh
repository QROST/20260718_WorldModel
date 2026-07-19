#!/bin/sh
# Authored by QROST, 2026.
# Provenance: https://github.com/QROST/20260718_WorldModel


set -eu

REPO_ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd)
cd "$REPO_ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  printf '%s\n' "[demo] pnpm is required. Run ./setup-demo.sh after installing pnpm 11.14.0." >&2
  exit 1
fi

if [ ! -f .next/BUILD_ID ]; then
  printf '%s\n' "[demo] Production build is missing; running ./build-demo.sh first."
  "$REPO_ROOT/build-demo.sh"
else
  if [ ! -x node_modules/.bin/next ]; then
    printf '%s\n' "[demo] Dependencies are missing; running ./setup-demo.sh first."
    "$REPO_ROOT/setup-demo.sh"
  fi
  printf '%s\n' "[demo] Using the existing production build. Run ./build-demo.sh after source changes."
fi

"$REPO_ROOT/check-demo-keys.sh"

DEMO_PORT=${FASHION_MAZE_PORT:-3000}
case "$DEMO_PORT" in
  ''|*[!0-9]*)
    printf '%s\n' "[demo] FASHION_MAZE_PORT must be a numeric port; found '$DEMO_PORT'." >&2
    exit 1
    ;;
esac

printf '%s\n' "[demo] Starting Fashion Maze at http://127.0.0.1:$DEMO_PORT"
printf '%s\n' "[demo] Before stopping the server, use End Session in the page for any live Reactor session."

trap 'printf "%s\n" "[demo] Server stopped. Confirm that no Reactor session remains active."' 0
"$REPO_ROOT/node_modules/.bin/next" start -H 127.0.0.1 -p "$DEMO_PORT"
