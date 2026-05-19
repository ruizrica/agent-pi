#!/usr/bin/env bash
# ABOUTME: Captures safe Project Memory Pack change summaries from git hooks.
# ABOUTME: Promotes only explicit milestone commits/markers to durable journal/milestones notes.

set -euo pipefail

MODE="${1:-post-commit}"
if [[ "$MODE" != "post-commit" && "$MODE" != "dry-run" && "$MODE" != "test-write" ]]; then
  echo "usage: $0 [post-commit|dry-run|test-write] [commit-ish]" >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

COMMIT="${2:-HEAD}"
if ! git rev-parse --verify "$COMMIT" >/dev/null 2>&1; then
  echo "project-memory-hook: commit not found: $COMMIT" >&2
  exit 1
fi

DATE_UTC="$(date -u +%F)"
STAMP_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SHORT_HASH="$(git rev-parse --short "$COMMIT")"
FULL_HASH="$(git rev-parse "$COMMIT")"
BRANCH="$(git branch --show-current 2>/dev/null || echo detached)"
SUBJECT="$(git log -1 --format=%s "$COMMIT")"
SLUG="$(printf '%s' "$SUBJECT" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-60)"
[[ -n "$SLUG" ]] || SLUG="$SHORT_HASH"

BASE_DIR=".context/project-memory"
CHANGES_DIR="$BASE_DIR/changes"
MILESTONES_DIR="journal/milestones"
CHANGE_FILE="$CHANGES_DIR/$DATE_UTC.md"
RAW_FILE="$MILESTONES_DIR/$DATE_UTC-$SLUG.md"

FILES_CHANGED="$(git diff-tree --no-commit-id --name-only -r "$COMMIT" | sed 's/^/- `/; s/$/`/' || true)"
STAT="$(git show --stat --oneline --no-renames --format= "$COMMIT" | sed 's/[[:space:]]*$//' || true)"

MILESTONE=0
if [[ "$SUBJECT" =~ \[(milestone|wiki)\] ]]; then
  MILESTONE=1
fi
if [[ "${PROJECT_MEMORY_FORCE_MILESTONE:-0}" == "1" ]]; then
  MILESTONE=1
fi
if [[ -f "$BASE_DIR/MILESTONE" ]]; then
  MILESTONE=1
fi

emit_change_summary() {
  echo "## $STAMP_UTC — $SHORT_HASH"
  echo
  echo "- **Branch:** $BRANCH"
  echo "- **Commit:** $FULL_HASH"
  echo "- **Subject:** $SUBJECT"
  echo
  echo "### Changed files"
  if [[ -n "$FILES_CHANGED" ]]; then
    echo "$FILES_CHANGED"
  else
    echo "- _No changed files detected._"
  fi
  echo
  echo "### Stat"
  echo '```text'
  if [[ -n "$STAT" ]]; then
    echo "$STAT"
  else
    echo "No stat available."
  fi
  echo '```'
  echo
}

emit_milestone_note() {
  echo "---"
  echo "status: draft"
  echo "ready_for_wiki: false"
  echo "wiki_ingested: false"
  echo "---"
  echo
  echo "# Milestone Raw Note — $SUBJECT"
  echo
  echo "- **Captured:** $STAMP_UTC"
  echo "- **Branch:** $BRANCH"
  echo "- **Commit:** $FULL_HASH"
  echo "- **Source:** git project-memory hook"
  echo
  echo "## Summary"
  echo
  echo "TODO: Replace this line with a human-written milestone summary before wiki/Obsidian ingestion."
  echo
  echo "## Changed files"
  if [[ -n "$FILES_CHANGED" ]]; then
    echo "$FILES_CHANGED"
  else
    echo "- _No changed files detected._"
  fi
  echo
  echo "## Verification"
  echo
  echo "- TODO: Add verification commands or manual checks."
  echo
  echo "## Lessons / Decisions"
  echo
  echo "- TODO: Add durable lessons, decisions, or rationale."
  echo
  echo "## Obsidian ingestion"
  echo
  echo "- **Ready for ingestion:** false"
  echo "- **Obsidian path:** TODO after ingestion"
}

if [[ "$MODE" == "dry-run" ]]; then
  echo "project-memory-hook: dry-run preview only; no files will be written"
  echo "project-memory-hook: change summary target: $CHANGE_FILE"
  echo
  echo "--- change summary preview ---"
  emit_change_summary
  if [[ "$MILESTONE" -eq 1 ]]; then
    echo "project-memory-hook: milestone note target: $RAW_FILE"
    echo
    echo "--- milestone note preview ---"
    emit_milestone_note
  else
    echo "project-memory-hook: no milestone raw note would be created"
  fi
  exit 0
fi

mkdir -p "$CHANGES_DIR" "$MILESTONES_DIR"
emit_change_summary >> "$CHANGE_FILE"

if [[ "$MILESTONE" -eq 1 ]]; then
  if [[ ! -f "$RAW_FILE" ]]; then
    emit_milestone_note > "$RAW_FILE"
  fi
  echo "project-memory-hook: wrote change summary $CHANGE_FILE and milestone raw note $RAW_FILE"
else
  echo "project-memory-hook: wrote change summary $CHANGE_FILE (no milestone raw note)"
fi
