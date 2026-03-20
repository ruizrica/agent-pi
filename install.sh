#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# agent installer — sets up the Pi agent extension suite
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colors ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# ── Helpers ────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}ℹ${NC}  $1"; }
success() { echo -e "${GREEN}✓${NC}  $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
fail()    { echo -e "${RED}✗${NC}  $1"; }
step()    { echo -e "\n${CYAN}${BOLD}── $1 ──${NC}"; }

# ── Resolve script directory (works even if called from elsewhere) ─
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "\n${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║       agent installer v1.1.0              ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}\n"

# ═══════════════════════════════════════════════════════════════════
# Step 1: Check Prerequisites
# ═══════════════════════════════════════════════════════════════════
step "Checking prerequisites"

ERRORS=0

# Node.js
if command -v node &>/dev/null; then
    NODE_VER=$(node --version)
    success "Node.js ${DIM}${NODE_VER}${NC}"
else
    fail "Node.js not found — install from https://nodejs.org"
    ERRORS=$((ERRORS + 1))
fi

# npm
if command -v npm &>/dev/null; then
    NPM_VER=$(npm --version)
    success "npm ${DIM}v${NPM_VER}${NC}"
else
    fail "npm not found — install Node.js from https://nodejs.org"
    ERRORS=$((ERRORS + 1))
fi

# git
if command -v git &>/dev/null; then
    GIT_VER=$(git --version | awk '{print $3}')
    success "git ${DIM}v${GIT_VER}${NC}"
else
    fail "git not found — install from https://git-scm.com"
    ERRORS=$((ERRORS + 1))
fi

# Bun (optional, but recommended)
if command -v bun &>/dev/null; then
    BUN_VER=$(bun --version)
    success "Bun ${DIM}v${BUN_VER}${NC} ${DIM}(optional, speeds up installs)${NC}"
else
    info "Bun not found ${DIM}(optional — install from https://bun.sh for faster installs)${NC}"
fi

if [ "$ERRORS" -gt 0 ]; then
    echo ""
    fail "Missing $ERRORS prerequisite(s). Install them and re-run."
    exit 1
fi

# ═══════════════════════════════════════════════════════════════════
# Step 2: Install Pi CLI
# ═══════════════════════════════════════════════════════════════════
step "Checking Pi Coding Agent CLI"

if command -v pi &>/dev/null; then
    PI_PATH=$(which pi)
    success "Pi CLI found at ${DIM}${PI_PATH}${NC}"
else
    info "Pi CLI not found — installing globally..."
    npm install -g @mariozechner/pi-coding-agent
    if command -v pi &>/dev/null; then
        success "Pi CLI installed"
    else
        fail "Failed to install Pi CLI. Try manually: npm install -g @mariozechner/pi-coding-agent"
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════════════════════
# Step 3: Install Dependencies
# ═══════════════════════════════════════════════════════════════════
step "Installing dependencies"

# Root dependencies
if [ -f "package.json" ]; then
    info "Installing root dependencies..."
    npm install --silent 2>/dev/null || npm install
    success "Root dependencies installed"
else
    warn "No package.json found in repo root"
fi

# Extension dependencies
if [ -f "agent/extensions/package.json" ]; then
    info "Installing extension dependencies..."
    (cd agent/extensions && npm install --silent 2>/dev/null || npm install)
    success "Extension dependencies installed"
else
    warn "No agent/extensions/package.json found"
fi

# ═══════════════════════════════════════════════════════════════════
# Step 4: Validate Agent Configs
# ═══════════════════════════════════════════════════════════════════
step "Validating agent configuration"

AGENT_DIR="agent/.pi/agents"

# Check agent-chain.yaml
if [ -f "$AGENT_DIR/agent-chain.yaml" ]; then
    success "agent-chain.yaml exists"
else
    fail "Missing: $AGENT_DIR/agent-chain.yaml"
    fail "This file should be in the git repo. Try: git checkout -- $AGENT_DIR/"
    ERRORS=$((ERRORS + 1))
fi

# Check pipeline-team.yaml
if [ -f "$AGENT_DIR/pipeline-team.yaml" ]; then
    success "pipeline-team.yaml exists"
else
    fail "Missing: $AGENT_DIR/pipeline-team.yaml"
    fail "This file should be in the git repo. Try: git checkout -- $AGENT_DIR/"
    ERRORS=$((ERRORS + 1))
fi

# Check teams.yaml
if [ -f "$AGENT_DIR/teams.yaml" ]; then
    success "teams.yaml exists"
else
    warn "Missing: $AGENT_DIR/teams.yaml"
fi

# Check core agent definitions
CORE_AGENTS=("builder.md" "reviewer.md" "scout.md" "planner.md" "tester.md")
MISSING_AGENTS=0
for agent_file in "${CORE_AGENTS[@]}"; do
    if [ ! -f "$AGENT_DIR/$agent_file" ]; then
        fail "Missing agent definition: $AGENT_DIR/$agent_file"
        MISSING_AGENTS=$((MISSING_AGENTS + 1))
    fi
done
if [ "$MISSING_AGENTS" -eq 0 ]; then
    success "All core agent definitions present ${DIM}(${#CORE_AGENTS[@]} agents)${NC}"
else
    ERRORS=$((ERRORS + MISSING_AGENTS))
fi

# ═══════════════════════════════════════════════════════════════════
# Step 5: Handle Broken Symlinks
# ═══════════════════════════════════════════════════════════════════
step "Checking for broken symlinks"

BROKEN_LINKS=0
while IFS= read -r -d '' link; do
    if [ ! -e "$link" ]; then
        warn "Removing broken symlink: ${DIM}$link${NC}"
        rm "$link" 2>/dev/null || true
        BROKEN_LINKS=$((BROKEN_LINKS + 1))
    fi
done < <(find "$AGENT_DIR" -type l -print0 2>/dev/null)

if [ "$BROKEN_LINKS" -eq 0 ]; then
    success "No broken symlinks found"
else
    warn "Removed $BROKEN_LINKS broken symlink(s)"
fi

# ═══════════════════════════════════════════════════════════════════
# Step 6: Seed models.json if Missing
# ═══════════════════════════════════════════════════════════════════
step "Checking model configuration"

if [ -f "agent/models.json" ]; then
    success "agent/models.json exists"
else
    if [ -f "agent/models.json.template" ]; then
        info "agent/models.json not found — creating from template..."
        cp agent/models.json.template agent/models.json
        success "Created agent/models.json from template"
        warn "Edit ${BOLD}agent/models.json${NC} to add your API keys"
        echo -e "   ${DIM}Providers: Anthropic, OpenRouter, Synthetic, and more${NC}"
        echo -e "   ${DIM}Set ANTHROPIC_API_KEY env var or paste key in the file${NC}"
    else
        warn "No agent/models.json or template found"
        warn "You'll need to create agent/models.json for multi-provider support"
    fi
fi

# ═══════════════════════════════════════════════════════════════════
# Step 7: Validate settings.json
# ═══════════════════════════════════════════════════════════════════
step "Validating settings"

if [ -f "agent/settings.json" ]; then
    if node -e "JSON.parse(require('fs').readFileSync('agent/settings.json','utf-8'))" 2>/dev/null; then
        success "agent/settings.json is valid JSON"
    else
        fail "agent/settings.json contains invalid JSON"
        ERRORS=$((ERRORS + 1))
    fi
else
    fail "Missing: agent/settings.json"
    ERRORS=$((ERRORS + 1))
fi

# ═══════════════════════════════════════════════════════════════════
# Step 8: Verify Extensions Exist
# ═══════════════════════════════════════════════════════════════════
step "Verifying extensions"

MISSING_EXT=0
TOTAL_EXT=0
if [ -f "agent/settings.json" ]; then
    # Extract extension paths from settings.json packages array
    while IFS= read -r ext_path; do
        ext_path=$(echo "$ext_path" | tr -d '",' | xargs)
        if [ -n "$ext_path" ] && [[ "$ext_path" == extensions/* ]]; then
            TOTAL_EXT=$((TOTAL_EXT + 1))
            if [ ! -f "agent/$ext_path" ]; then
                fail "Missing extension: agent/$ext_path"
                MISSING_EXT=$((MISSING_EXT + 1))
            fi
        fi
    done < <(node -e "
        const s = JSON.parse(require('fs').readFileSync('agent/settings.json','utf-8'));
        if (s.packages) s.packages.forEach(p => console.log(p));
    " 2>/dev/null)
fi

if [ "$MISSING_EXT" -eq 0 ] && [ "$TOTAL_EXT" -gt 0 ]; then
    success "All $TOTAL_EXT extensions present"
elif [ "$TOTAL_EXT" -eq 0 ]; then
    warn "Could not read extensions from settings.json"
else
    ERRORS=$((ERRORS + MISSING_EXT))
fi

# ═══════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"

if [ "$ERRORS" -gt 0 ]; then
    echo -e "${RED}${BOLD}  Installation completed with $ERRORS error(s)${NC}"
    echo -e "${DIM}  Run ${NC}${BOLD}./pi-doctor.sh${NC}${DIM} for a detailed diagnostic${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════${NC}"
    exit 1
else
    echo -e "${GREEN}${BOLD}  ✓ Installation complete!${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}Quick start:${NC}"
    echo -e "    ${CYAN}cd agent && pi${NC}"
    echo ""
    echo -e "  ${BOLD}Verify anytime:${NC}"
    echo -e "    ${CYAN}./pi-doctor.sh${NC}"
    echo ""
    echo -e "  ${BOLD}Modes:${NC} ${DIM}Shift+Tab to cycle NORMAL → PLAN → SPEC → PIPELINE → TEAM → CHAIN${NC}"
    echo -e "  ${BOLD}Themes:${NC} ${DIM}Ctrl+T to cycle through 11 themes${NC}"
    echo ""
fi
