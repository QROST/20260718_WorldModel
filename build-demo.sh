#!/bin/sh

set -eu

REPO_ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd)
cd "$REPO_ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  printf '%s\n' "[build] pnpm is required. Run ./setup-demo.sh after installing pnpm 11.14.0." >&2
  exit 1
fi

printf '%s\n' "[build] Synchronizing the locked dependency set..."
"$REPO_ROOT/setup-demo.sh"

printf '%s\n' "[build] Running TypeScript checks..."
pnpm typecheck

printf '%s\n' "[build] Running offline verification and the production build..."
printf '%s\n' "[build] No Reactor or OpenAI request is made by these checks."
pnpm build

if [ ! -f .next/BUILD_ID ]; then
  printf '%s\n' "[build] Next.js finished without producing .next/BUILD_ID." >&2
  exit 1
fi

printf '%s\n' "[build] Production build is ready. Run ./start-demo.sh."
