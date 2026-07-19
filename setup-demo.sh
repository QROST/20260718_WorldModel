#!/bin/sh
# Authored by QROST, 2026.
# Provenance: https://github.com/QROST/20260718_WorldModel


set -eu

REPO_ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd)
cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' "[setup] Node.js is required. Install Node.js 20 or newer, then run this script again." >&2
  exit 1
fi

node -e '
const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  console.error(`[setup] Node.js 20 or newer is required; found ${process.versions.node}.`);
  process.exit(1);
}
'

if ! command -v pnpm >/dev/null 2>&1; then
  printf '%s\n' "[setup] pnpm 11.14.0 is required. Install pnpm, then run this script again." >&2
  exit 1
fi

INSTALLED_PNPM_VERSION=$(pnpm --version)
if [ "$INSTALLED_PNPM_VERSION" != "11.14.0" ]; then
  printf '%s\n' "[setup] Warning: this project pins pnpm 11.14.0; found $INSTALLED_PNPM_VERSION." >&2
fi

printf '%s\n' "[setup] Installing the locked dependency set..."
printf '%s\n' "[setup] First-time installation requires access to the package registry."
pnpm install --frozen-lockfile --config.confirmModulesPurge=false

printf '%s\n' "[setup] Dependencies are ready."
printf '%s\n' "[setup] Next: run ./build-demo.sh for production or ./start-dev.sh for development."
