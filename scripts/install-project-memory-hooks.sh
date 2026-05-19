#!/usr/bin/env bash
# ABOUTME: Installs/chains Project Memory Pack git hooks without overwriting existing hooks.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

HOOKS_PATH="$(git config --get core.hooksPath || true)"
if [[ -z "$HOOKS_PATH" ]]; then
  HOOKS_PATH=".git/hooks"
fi

case "$HOOKS_PATH" in
  /*) HOOKS_DIR="$HOOKS_PATH" ;;
  *) HOOKS_DIR="$ROOT/$HOOKS_PATH" ;;
esac

mkdir -p "$HOOKS_DIR"
POST_COMMIT="$HOOKS_DIR/post-commit"

if [[ -f "$POST_COMMIT" ]] && grep -Fq 'scripts/project-memory-hook.sh' "$POST_COMMIT"; then
  echo "Project Memory Pack hook already installed: $POST_COMMIT"
  exit 0
fi

if [[ -f "$POST_COMMIT" ]]; then
  cat >> "$POST_COMMIT" <<'EOF'

# Project Memory Pack post-commit hook
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  if ! "$(git rev-parse --show-toplevel)/scripts/project-memory-hook.sh" post-commit; then
    echo "warning: Project Memory Pack post-commit hook failed" >&2
  fi
fi
EOF
else
  cat > "$POST_COMMIT" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Project Memory Pack post-commit hook
if git rev-parse --show-toplevel >/dev/null 2>&1; then
  if ! "$(git rev-parse --show-toplevel)/scripts/project-memory-hook.sh" post-commit; then
    echo "warning: Project Memory Pack post-commit hook failed" >&2
  fi
fi
EOF
fi

chmod +x "$POST_COMMIT"
chmod +x scripts/project-memory-hook.sh
if [[ -f .githooks/project-memory-post-commit ]]; then
  chmod +x .githooks/project-memory-post-commit
fi

cat <<EOF
Installed Project Memory Pack post-commit hook: $POST_COMMIT
Active core.hooksPath: $HOOKS_PATH

Routine commits write local summaries to:
  .context/project-memory/changes/YYYY-MM-DD.md

Only commits tagged [milestone] or [wiki], or commits made while .context/project-memory/MILESTONE exists, create durable draft milestone raw notes in:
  journal/milestones/

Preview without writing:
  scripts/project-memory-hook.sh dry-run HEAD

Deliberate local write test:
  PROJECT_MEMORY_FORCE_MILESTONE=1 scripts/project-memory-hook.sh test-write HEAD
EOF
