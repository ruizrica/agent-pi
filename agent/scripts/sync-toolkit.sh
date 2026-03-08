#!/bin/bash
# ABOUTME: Syncs the ruizrica/toolkit GitHub repo into Pi's agent directories.
# ABOUTME: Pulls latest, copies agents/commands/skills, installs agent-memory CLI.

set -e

# ── Configuration ─────────────────────────────────────────────────────────

REPO_URL="https://github.com/ruizrica/toolkit"
TOOLKIT_DIR="$HOME/.toolkit"
PI_AGENT_DIR="$HOME/.pi/agent"

# Destination directories
AGENTS_DST="$PI_AGENT_DIR/.pi/agents/toolkit"
COMMANDS_DST="$PI_AGENT_DIR/.pi/prompts/toolkit"
SKILLS_DST="$PI_AGENT_DIR/skills"
COMMANDS_LINK="$PI_AGENT_DIR/.pi/commands/toolkit"

# Source directories (inside toolkit repo)
AGENTS_SRC="$TOOLKIT_DIR/plugins/toolkit/agents"
COMMANDS_SRC="$TOOLKIT_DIR/plugins/toolkit/commands"
SKILLS_SRC="$TOOLKIT_DIR/plugins/toolkit/skills"
MEMORY_SRC="$TOOLKIT_DIR/tools/agent-memory"

# ── Colors ────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────

info()    { echo -e "${BLUE}$1${NC}"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
error()   { echo -e "${RED}✗ $1${NC}"; }
dim()     { echo -e "${DIM}  $1${NC}"; }

# ── Step 1: Clone or Pull ────────────────────────────────────────────────

info "Syncing toolkit from $REPO_URL"

if [[ -d "$TOOLKIT_DIR/.git" ]]; then
    info "Pulling latest changes..."
    cd "$TOOLKIT_DIR"
    OLD_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    if git pull --ff-only 2>/dev/null; then
        NEW_HEAD=$(git rev-parse HEAD)
        if [[ "$OLD_HEAD" == "$NEW_HEAD" ]]; then
            dim "Already up to date ($OLD_HEAD)"
        else
            success "Updated: ${OLD_HEAD:0:8} → ${NEW_HEAD:0:8}"
            dim "$(git log --oneline "$OLD_HEAD..$NEW_HEAD" 2>/dev/null | head -5)"
        fi
    else
        warn "Fast-forward pull failed — trying fetch + reset"
        git fetch origin
        git reset --hard origin/main 2>/dev/null || git reset --hard origin/master
        success "Force-synced to origin"
    fi
else
    info "Cloning toolkit repository..."
    git clone --quiet "$REPO_URL" "$TOOLKIT_DIR" 2>/dev/null
    success "Cloned to $TOOLKIT_DIR"
fi

# ── Step 2: Sync Agents ──────────────────────────────────────────────────

info "Syncing agents..."
mkdir -p "$AGENTS_DST"

AGENTS_CHANGED=0
for f in "$AGENTS_SRC"/*.md; do
    name=$(basename "$f")
    if [[ -f "$AGENTS_DST/$name" ]]; then
        if ! diff -q "$f" "$AGENTS_DST/$name" >/dev/null 2>&1; then
            cp "$f" "$AGENTS_DST/$name"
            dim "updated: $name"
            AGENTS_CHANGED=$((AGENTS_CHANGED + 1))
        fi
    else
        cp "$f" "$AGENTS_DST/$name"
        dim "added: $name"
        AGENTS_CHANGED=$((AGENTS_CHANGED + 1))
    fi
done
if [[ $AGENTS_CHANGED -eq 0 ]]; then
    success "Agents: no changes ($(ls "$AGENTS_SRC"/*.md 2>/dev/null | wc -l | tr -d ' ') files)"
else
    success "Agents: $AGENTS_CHANGED file(s) updated"
fi

# ── Step 3: Sync Commands ────────────────────────────────────────────────

info "Syncing commands..."
mkdir -p "$COMMANDS_DST"

# Commands to skip (handled natively by Pi extensions)
SKIP_COMMANDS="compact.md compact-min.md restore.md agent-memory.md"

CMDS_CHANGED=0
for f in "$COMMANDS_SRC"/*.md; do
    name=$(basename "$f")

    # Skip commands that Pi handles natively
    if echo "$SKIP_COMMANDS" | grep -qw "$name"; then
        continue
    fi

    if [[ -f "$COMMANDS_DST/$name" ]]; then
        if ! diff -q "$f" "$COMMANDS_DST/$name" >/dev/null 2>&1; then
            cp "$f" "$COMMANDS_DST/$name"
            dim "updated: $name"
            CMDS_CHANGED=$((CMDS_CHANGED + 1))
        fi
    else
        cp "$f" "$COMMANDS_DST/$name"
        dim "added: $name"
        CMDS_CHANGED=$((CMDS_CHANGED + 1))
    fi
done
if [[ $CMDS_CHANGED -eq 0 ]]; then
    success "Commands: no changes ($(ls "$COMMANDS_SRC"/*.md 2>/dev/null | wc -l | tr -d ' ') files)"
else
    success "Commands: $CMDS_CHANGED file(s) updated"
fi

# ── Step 4: Ensure symlink for command scanner ───────────────────────────

info "Ensuring command scanner symlink..."
mkdir -p "$(dirname "$COMMANDS_LINK")"

if [[ -L "$COMMANDS_LINK" ]]; then
    CURRENT_TARGET=$(readlink "$COMMANDS_LINK")
    if [[ "$CURRENT_TARGET" == "$COMMANDS_DST" ]]; then
        success "Symlink: already correct"
    else
        ln -sfn "$COMMANDS_DST" "$COMMANDS_LINK"
        success "Symlink: updated → $COMMANDS_DST"
    fi
elif [[ -e "$COMMANDS_LINK" ]]; then
    warn "Symlink path exists but is not a symlink: $COMMANDS_LINK"
    warn "Skipping — remove manually if needed"
else
    ln -s "$COMMANDS_DST" "$COMMANDS_LINK"
    success "Symlink: created $COMMANDS_LINK → $COMMANDS_DST"
fi

# ── Step 5: Sync Skills ──────────────────────────────────────────────────

info "Syncing skills..."

# agent-memory skill — skipped (Pi has its own memory system via memory-cycle.ts)
success "Skill: agent-memory (skipped — Pi native)"

# just-bash skill
BASH_SKILL_DST="$SKILLS_DST/just-bash"
if [[ -f "$SKILLS_SRC/just-bash.md" ]]; then
    mkdir -p "$BASH_SKILL_DST"
    if [[ -f "$BASH_SKILL_DST/SKILL.md" ]]; then
        if ! diff -q "$SKILLS_SRC/just-bash.md" "$BASH_SKILL_DST/SKILL.md" >/dev/null 2>&1; then
            cp "$SKILLS_SRC/just-bash.md" "$BASH_SKILL_DST/SKILL.md"
            success "Skill: just-bash updated"
        else
            success "Skill: just-bash (no changes)"
        fi
    else
        cp "$SKILLS_SRC/just-bash.md" "$BASH_SKILL_DST/SKILL.md"
        success "Skill: just-bash installed"
    fi
fi

# ── Step 6: Install agent-memory Python tool ─────────────────────────────

info "Checking agent-memory CLI..."
if command -v agent-memory &>/dev/null; then
    success "agent-memory: already on PATH"
else
    if [[ -d "$MEMORY_SRC" ]]; then
        info "Installing agent-memory..."
        if pip3 install --break-system-packages -e "$MEMORY_SRC" 2>/dev/null; then
            success "agent-memory: installed"
        else
            warn "agent-memory: pip install failed"
            dim "Manual: pip3 install --break-system-packages -e $MEMORY_SRC"
        fi
    else
        warn "agent-memory source not found at $MEMORY_SRC"
    fi
fi

# ── Step 7: Ensure agent-browser is installed ────────────────────────────

info "Checking agent-browser..."
if command -v agent-browser &>/dev/null; then
    success "agent-browser: already installed"
else
    if command -v npm &>/dev/null; then
        info "Installing agent-browser..."
        if npm install -g agent-browser 2>/dev/null; then
            success "agent-browser: installed"
        else
            warn "agent-browser: npm install failed"
            dim "Manual: npm install -g agent-browser"
        fi
    else
        warn "npm not found — skip agent-browser install"
    fi
fi

# ── Step 8: Ensure just-bash is installed ────────────────────────────────

info "Checking just-bash..."
if command -v just-bash &>/dev/null; then
    success "just-bash: already installed"
else
    if command -v npm &>/dev/null; then
        info "Installing just-bash..."
        if npm install -g just-bash 2>/dev/null; then
            success "just-bash: installed"
        else
            warn "just-bash: npm install failed"
            dim "Manual: npm install -g just-bash"
        fi
    else
        warn "npm not found — skip just-bash install"
    fi
fi

# ── Step 9: Create memory directories ────────────────────────────────────

mkdir -p "$HOME/.claude/agent-memory/daily-logs"
mkdir -p "$HOME/.claude/agent-memory/sessions"
mkdir -p "$HOME/.claude/agent-memory/procedures"

# ── Summary ──────────────────────────────────────────────────────────────

echo ""
info "═══════════════════════════════════════════"
success "Toolkit sync complete!"
echo ""
dim "Agents:   $AGENTS_DST/ ($(ls "$AGENTS_DST"/*.md 2>/dev/null | wc -l | tr -d ' ') files)"
dim "Commands: $COMMANDS_DST/ ($(ls "$COMMANDS_DST"/*.md 2>/dev/null | wc -l | tr -d ' ') files)"
dim "Skills:   $SKILLS_DST/"
dim "Symlink:  $COMMANDS_LINK → $COMMANDS_DST"
echo ""
dim "To update: bash ~/.pi/agent/scripts/sync-toolkit.sh"
dim "Repo:     $TOOLKIT_DIR"
info "═══════════════════════════════════════════"
