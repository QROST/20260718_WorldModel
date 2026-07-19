#!/bin/sh

set -eu

REPO_ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd)
cd "$REPO_ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  printf '%s\n' "[dev] pnpm is required. Run ./setup-demo.sh after installing pnpm 11.14.0." >&2
  exit 1
fi

if [ ! -x node_modules/.bin/next ]; then
  printf '%s\n' "[dev] Dependencies are missing; running ./setup-demo.sh first."
  "$REPO_ROOT/setup-demo.sh"
fi

"$REPO_ROOT/check-demo-keys.sh"

DEMO_PORT=${FASHION_MAZE_PORT:-3000}
case "$DEMO_PORT" in
  ''|*[!0-9]*)
    printf '%s\n' "[dev] FASHION_MAZE_PORT must be a numeric port; found '$DEMO_PORT'." >&2
    exit 1
    ;;
esac

printf '%s\n' "[dev] Starting the development server at http://127.0.0.1:$DEMO_PORT"
printf '%s\n' "[dev] Live features require server-side credentials; this script never prints them."
printf '%s\n' "[dev] Before stopping the server, use End Session in the page for any live Reactor session."

trap 'printf "%s\n" "[dev] Server stopped. Confirm that no Reactor session remains active."' 0
"$REPO_ROOT/node_modules/.bin/next" dev -H 127.0.0.1 -p "$DEMO_PORT"
