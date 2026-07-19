#!/bin/sh

set -eu

REPO_ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd)
cd "$REPO_ROOT"

env_file_declares() {
  DEMO_VARIABLE_NAME=$1
  for DEMO_CONFIG_FILE in \
    .env.local \
    .env.production.local \
    .env.development.local \
    .env.production \
    .env.development \
    .env
  do
    if [ -f "$DEMO_CONFIG_FILE" ] && grep -Eq "^[[:space:]]*${DEMO_VARIABLE_NAME}[[:space:]]*=[[:space:]]*.+$" "$DEMO_CONFIG_FILE"; then
      return 0
    fi
  done
  return 1
}

REACTOR_KEY_MISSING=0
OPENAI_KEY_MISSING=0

if [ -n "${REACTOR_API_KEY:-}" ] || [ -s reactor.key ] || env_file_declares REACTOR_API_KEY; then
  printf '%s\n' "[keys] Reactor server credential detected; its value will not be printed."
else
  REACTOR_KEY_MISSING=1
  printf '%s\n' "[keys] Reactor API key is missing: only the static preview is available." >&2
  printf '%s\n' "[keys] Get a key: https://www.reactor.inc/account/api-keys" >&2
  printf '%s\n' "[keys] Sign in or create an account, create an API key (rk_...), and confirm LingBot World 2 access/credits." >&2
  printf '%s\n' "[keys] Official guide: https://docs.reactor.inc/authentication" >&2
fi

if [ -n "${OPENAI_API_KEY:-}" ] || [ -s openai.key ] || env_file_declares OPENAI_API_KEY; then
  printf '%s\n' "[keys] OpenAI server credential detected; its value will not be printed."
else
  OPENAI_KEY_MISSING=1
  printf '%s\n' "[keys] OpenAI API key is missing: Scene 8 generation is unavailable." >&2
  printf '%s\n' "[keys] Scenes 1-7 still work when the Reactor key is configured." >&2
  printf '%s\n' "[keys] Create a key: https://platform.openai.com/settings/organization/api-keys" >&2
  printf '%s\n' "[keys] Check API billing: https://platform.openai.com/account/billing/overview" >&2
  printf '%s\n' "[keys] GPT Image may require organization verification: https://platform.openai.com/settings/organization/general" >&2
  printf '%s\n' "[keys] OpenAI API billing is separate from a ChatGPT subscription." >&2
fi

if [ "$REACTOR_KEY_MISSING" -eq 1 ] || [ "$OPENAI_KEY_MISSING" -eq 1 ]; then
  printf '\n%s\n' "[keys] Save each missing key in ONE server-only location:" >&2
  printf '%s\n' "[keys] Option A (recommended): create or edit ./.env.local." >&2
  printf '%s\n' "[keys]   If it does not exist yet: cp .env.example .env.local" >&2
  if [ "$REACTOR_KEY_MISSING" -eq 1 ]; then
    printf '%s\n' "[keys]   Add: REACTOR_API_KEY=<paste-your-reactor-key>" >&2
  fi
  if [ "$OPENAI_KEY_MISSING" -eq 1 ]; then
    printf '%s\n' "[keys]   Add: OPENAI_API_KEY=<paste-your-openai-key>" >&2
  fi
  printf '%s\n' "[keys]   Protect it: chmod 600 .env.local" >&2
  printf '%s\n' "[keys] Option B: use raw-key files in this repository root." >&2
  if [ "$REACTOR_KEY_MISSING" -eq 1 ]; then
    printf '%s\n' "[keys]   Put only the raw Reactor key in ./reactor.key, then: chmod 600 reactor.key" >&2
  fi
  if [ "$OPENAI_KEY_MISSING" -eq 1 ]; then
    printf '%s\n' "[keys]   Put only the raw OpenAI key in ./openai.key, then: chmod 600 openai.key" >&2
  fi
  printf '%s\n' "[keys] Never put real keys in .env.example, Git, a ZIP, browser code, screenshots, or logs." >&2
  printf '%s\n' "[keys] Restart ./start-demo.sh or ./start-dev.sh after saving keys." >&2
else
  printf '%s\n' "[keys] Both server credentials are ready for the full demo."
fi
