#!/usr/bin/env bash
# ABOUTME: Regression check that agent-facing task guidance uses cmd, not raw backend commands.
# ABOUTME: Allows backend implementation details in scripts/cmd* but blocks direct backend usage in prompts and skills.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CANDIDATE_TARGETS=(
  "prompts/cmd"
  "skills/core/cmd"
  "skills/core/pi"
  "COMMANDER_AGENTS.md"
  "CLAUDE.md"
  "AGENTS.md"
)

TARGETS=()
for target in "${CANDIDATE_TARGETS[@]}"; do
  if [ -e "$target" ]; then
    TARGETS+=("$target")
  fi
done

# Agent-facing docs should not teach agents to invoke the raw backend directly.
# Keep implementation-only backend references inside scripts/cmd and scripts/cmd.test.sh instead.
PATTERN='(^|[^[:alnum:]_])bd([[:space:]]|$|[-`])|\.beads|bead|beads|Use \*\*bd directly\*\*|bd-ready|bd-native|bd-aware|bd-backed|cmd/bd'

if rg -n --hidden --glob '!node_modules' --glob '!.git' --glob '!scripts/cmd' --glob '!scripts/cmd.test.sh' "$PATTERN" "${TARGETS[@]}"; then
  cat >&2 <<'MSG'

check-cmd-wrapper-guidance: FAILED
Agent-facing guidance must use `cmd` as the wrapper. Do not instruct agents to run raw backend/bd commands directly.
If a backend mention is truly implementation-only, move or keep it under scripts/cmd* and explain it as wrapper internals.
MSG
  exit 1
fi

echo "check-cmd-wrapper-guidance: ok — agent-facing guidance uses cmd wrapper commands"
