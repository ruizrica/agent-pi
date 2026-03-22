#!/usr/bin/env bash
# ABOUTME: Installer for the agent-pi extension package.
# ABOUTME: Registers this repo as a Pi package in ~/.pi/agent/settings.json.
# ABOUTME: Use --dry-run or --test to preview actions without changing the system.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Install banner art (same as extensions/agent-banner.ts DEFAULT_ART) ──
INSTALL_ART="$(cat <<'EOF'
                             ▄▄   
█████▄ ▄████▄ ▄████▄ █████▄ ▄██▄▄▄
▄▄▄▄██ ██  ██ ██▄▄██ ██  ██ ▀██▀▀▀
██▄▄██ ██▄▄██ ██▄▄▄▄ ██  ██  ██▄▄▄
 ▀▀▀▀▀  ▀▀▀██  ▀▀▀▀▀ ▀▀  ▀▀   ▀▀▀▀
        ████▀                     

EOF
)"

# ── Colors ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[38;2;30;144;255m'
CYAN='\033[38;2;30;144;255m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# ── Helpers ────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}ℹ${NC}  $1"; }
success() { echo -e "${GREEN}✓${NC}  $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
fail()    { echo -e "${RED}✗${NC}  $1"; }
step()    { echo -e "\n${CYAN}${BOLD}── $1 ──${NC}"; }

# ── Resolve directories ───────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DRY_RUN=0
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run|--dryrun|-n|--test)
            DRY_RUN=1
            ;;
        -h|--help)
            cat <<USAGE
Usage: $(basename "$0") [OPTIONS]

  --dry-run, --dryrun, -n, --test   Show what would run; do not install packages or write config
  -h, --help                        Show this help

Examples:
  ./install.sh                 Full install
  ./install.sh --dry-run       Validate prerequisites and print planned steps only
USAGE
            exit 0
            ;;
        *)
            echo "Unknown option: $1 (try --help)" >&2
            exit 1
            ;;
    esac
    shift
done

# Pi agent config directory (where Pi stores settings.json, models.json, etc.)
PI_AGENT_DIR="$HOME/.pi/agent"

# On MSYS/Git Bash (Windows), Node.js needs Windows-style paths.
# Bash commands work fine with /c/Users/... but Node.js sees C:\c\Users\...
if command -v cygpath &>/dev/null; then
    # Use -m for mixed mode (C:/Users/...) — forward slashes work in Node.js
    # and avoid backslash escape issues inside JS string literals.
    to_win_path() { cygpath -m "$1"; }
else
    to_win_path() { echo "$1"; }
fi

echo ""
echo -e "${CYAN}${INSTALL_ART}${NC}"
echo ""
echo -e "${DIM}  ricardo ruiz - ruizrica.io${NC}"
echo -e "${BOLD}${CYAN}  agent-pi extensions installer v1${NC}"
if [ "$DRY_RUN" -eq 1 ]; then
    echo -e "  ${YELLOW}${BOLD}[dry-run]${NC} ${DIM}No packages will be installed and no files will be modified.${NC}"
fi
echo ""
echo -e "  ${DIM}Package:  ${NC}${BOLD}$SCRIPT_DIR${NC}"
echo -e "  ${DIM}Pi config:${NC}${BOLD} $PI_AGENT_DIR${NC}"

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
    if [ "$DRY_RUN" -eq 1 ]; then
        info "[dry-run] Pi CLI not found — would run: ${DIM}npm install -g @mariozechner/pi-coding-agent${NC}"
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
fi

# ═══════════════════════════════════════════════════════════════════
# Step 3: Install Dependencies
# ═══════════════════════════════════════════════════════════════════
step "Installing dependencies"

# Root dependencies
if [ -f "package.json" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        info "[dry-run] Would run: ${DIM}npm install${NC} (repo root)"
    else
        info "Installing root dependencies..."
        npm install --silent 2>/dev/null || npm install
        success "Root dependencies installed"
    fi
else
    warn "No package.json found in repo root"
fi

# Extension dependencies
if [ -f "extensions/package.json" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        info "[dry-run] Would run: ${DIM}(cd extensions && npm install)${NC}"
    else
        info "Installing extension dependencies..."
        (cd extensions && npm install --silent 2>/dev/null || npm install)
        success "Extension dependencies installed"
    fi
else
    warn "No extensions/package.json found"
fi

# ═══════════════════════════════════════════════════════════════════
# Step 4: Register package in Pi settings
# ═══════════════════════════════════════════════════════════════════
step "Registering package with Pi"

if [ "$DRY_RUN" -eq 1 ]; then
    info "[dry-run] Would run: ${DIM}mkdir -p $PI_AGENT_DIR${NC}"
else
    mkdir -p "$PI_AGENT_DIR"
fi

SETTINGS_FILE="$PI_AGENT_DIR/settings.json"
# Windows-safe paths for Node.js (MSYS /c/... → C:\...)
SETTINGS_FILE_WIN="$(to_win_path "$SETTINGS_FILE")"
SCRIPT_DIR_WIN="$(to_win_path "$SCRIPT_DIR")"

if [ ! -f "$SETTINGS_FILE" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
        info "[dry-run] Would create ${DIM}$SETTINGS_FILE${NC} with ${DIM}{}${NC}"
    else
        echo '{}' > "$SETTINGS_FILE"
        info "Created ${DIM}$SETTINGS_FILE${NC}"
    fi
fi

# Add this repo to the packages array if not already present
if [ -f "$SETTINGS_FILE" ]; then
    ALREADY_REGISTERED=$(node -e "
    const fs = require('fs');
    const s = JSON.parse(fs.readFileSync('$SETTINGS_FILE_WIN', 'utf-8'));
    const pkgs = s.packages || [];
    console.log(pkgs.includes('$SCRIPT_DIR_WIN') ? 'yes' : 'no');
" 2>/dev/null || echo "no")
else
    ALREADY_REGISTERED="no"
fi

if [ "$ALREADY_REGISTERED" = "yes" ]; then
    success "Package already registered in settings.json"
else
    if [ "$DRY_RUN" -eq 1 ]; then
        info "[dry-run] Would append ${DIM}$SCRIPT_DIR${NC} to ${DIM}packages${NC} in ${DIM}$SETTINGS_FILE${NC}"
    else
        node -e "
        const fs = require('fs');
        const s = JSON.parse(fs.readFileSync('$SETTINGS_FILE_WIN', 'utf-8'));
        s.packages = s.packages || [];
        s.packages.push('$SCRIPT_DIR_WIN');
        fs.writeFileSync('$SETTINGS_FILE_WIN', JSON.stringify(s, null, 2) + '\n');
    "
        success "Registered ${DIM}$SCRIPT_DIR${NC} in Pi settings"
    fi
fi

# Verify Pi can see the package
if [ "$DRY_RUN" -eq 1 ]; then
    info "[dry-run] Skipping ${DIM}pi list${NC} verification (install not applied)"
else
    PACKAGE_COUNT=$(pi list 2>/dev/null | grep -c "$SCRIPT_DIR" || true)
    if [ "$PACKAGE_COUNT" -gt 0 ]; then
        success "Pi recognizes the package"
    else
        warn "Pi may not see the package yet — try running: pi list"
    fi
fi

# Enable quiet startup (suppress verbose keybindings/skills/extensions listing)
QUIET_ENABLED=$(node -e "
    const fs = require('fs');
    const s = JSON.parse(fs.readFileSync('$SETTINGS_FILE_WIN', 'utf-8'));
    console.log(s.quietStartup === true ? 'yes' : 'no');
" 2>/dev/null || echo "no")

if [ "$QUIET_ENABLED" = "yes" ]; then
    success "Quiet startup already enabled"
else
    if [ "$DRY_RUN" -eq 1 ]; then
        info "[dry-run] Would set ${DIM}quietStartup: true${NC} in ${DIM}$SETTINGS_FILE${NC}"
    else
        node -e "
        const fs = require('fs');
        const s = JSON.parse(fs.readFileSync('$SETTINGS_FILE_WIN', 'utf-8'));
        s.quietStartup = true;
        s.defaultThinkingLevel = s.defaultThinkingLevel || 'off';
        fs.writeFileSync('$SETTINGS_FILE_WIN', JSON.stringify(s, null, 2) + '\n');
    "
        success "Enabled quiet startup ${DIM}(thinking defaults to off)${NC}"
    fi
fi

# Free Shift+Tab for mode-cycler by unbinding cycleThinkingLevel
KEYBINDINGS_FILE="$PI_AGENT_DIR/keybindings.json"
KEYBINDINGS_FILE_WIN="$(to_win_path "$KEYBINDINGS_FILE")"

SHIFT_TAB_FREE=$(node -e "
    const fs = require('fs');
    if (!fs.existsSync('$KEYBINDINGS_FILE_WIN')) { console.log('no'); process.exit(); }
    const k = JSON.parse(fs.readFileSync('$KEYBINDINGS_FILE_WIN', 'utf-8'));
    console.log(Array.isArray(k.cycleThinkingLevel) && k.cycleThinkingLevel.length === 0 ? 'yes' : 'no');
" 2>/dev/null || echo "no")

if [ "$SHIFT_TAB_FREE" = "yes" ]; then
    success "Shift+Tab already freed for mode cycling"
else
    if [ "$DRY_RUN" -eq 1 ]; then
        info "[dry-run] Would unbind ${DIM}cycleThinkingLevel${NC} in ${DIM}$KEYBINDINGS_FILE${NC} to free Shift+Tab"
    else
        node -e "
        const fs = require('fs');
        const file = '$KEYBINDINGS_FILE_WIN';
        const k = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : {};
        k.cycleThinkingLevel = [];
        fs.writeFileSync(file, JSON.stringify(k, null, 2) + '\n');
    "
        success "Freed Shift+Tab for mode cycling ${DIM}(unbound cycleThinkingLevel)${NC}"
    fi
fi

# ═══════════════════════════════════════════════════════════════════
# Step 5: Validate Agent Configs
# ═══════════════════════════════════════════════════════════════════
step "Validating agent configuration"

CONFIG_DIR="agents"

# Check agent-chain.yaml
if [ -f "$CONFIG_DIR/agent-chain.yaml" ]; then
    success "agent-chain.yaml exists"
else
    fail "Missing: $CONFIG_DIR/agent-chain.yaml"
    fail "This file should be in the git repo. Try: git checkout -- $CONFIG_DIR/"
    ERRORS=$((ERRORS + 1))
fi

# Check pipeline-team.yaml
if [ -f "$CONFIG_DIR/pipeline-team.yaml" ]; then
    success "pipeline-team.yaml exists"
else
    fail "Missing: $CONFIG_DIR/pipeline-team.yaml"
    fail "This file should be in the git repo. Try: git checkout -- $CONFIG_DIR/"
    ERRORS=$((ERRORS + 1))
fi

# Check teams.yaml
if [ -f "$CONFIG_DIR/teams.yaml" ]; then
    success "teams.yaml exists"
else
    warn "Missing: $CONFIG_DIR/teams.yaml"
fi

# Check core agent definitions
CORE_AGENTS=("builder.md" "reviewer.md" "scout.md" "planner.md" "tester.md")
MISSING_AGENTS=0
for agent_file in "${CORE_AGENTS[@]}"; do
    if [ ! -f "$CONFIG_DIR/$agent_file" ]; then
        fail "Missing agent definition: $CONFIG_DIR/$agent_file"
        MISSING_AGENTS=$((MISSING_AGENTS + 1))
    fi
done
if [ "$MISSING_AGENTS" -eq 0 ]; then
    success "All core agent definitions present ${DIM}(${#CORE_AGENTS[@]} agents)${NC}"
else
    ERRORS=$((ERRORS + MISSING_AGENTS))
fi

# ═══════════════════════════════════════════════════════════════════
# Step 6: Handle Broken Symlinks
# ═══════════════════════════════════════════════════════════════════
step "Checking for broken symlinks"

BROKEN_LINKS=0
while IFS= read -r -d '' link; do
    if [ ! -e "$link" ]; then
        if [ "$DRY_RUN" -eq 1 ]; then
            warn "[dry-run] Would remove broken symlink: ${DIM}$link${NC}"
        else
            warn "Removing broken symlink: ${DIM}$link${NC}"
            rm "$link" 2>/dev/null || true
        fi
        BROKEN_LINKS=$((BROKEN_LINKS + 1))
    fi
done < <(find "$CONFIG_DIR" -type l -print0 2>/dev/null)

if [ "$BROKEN_LINKS" -eq 0 ]; then
    success "No broken symlinks found"
else
    if [ "$DRY_RUN" -eq 1 ]; then
        warn "[dry-run] Would remove $BROKEN_LINKS broken symlink(s)"
    else
        warn "Removed $BROKEN_LINKS broken symlink(s)"
    fi
fi

# ═══════════════════════════════════════════════════════════════════
# Step 7: Link Private Extensions (if present)
# ═══════════════════════════════════════════════════════════════════
step "Linking private extensions"

PRIVATE_PKG="$HOME/.pi/packages/private"

if [ -d "$PRIVATE_PKG" ]; then
    success "Private package found at ${DIM}$PRIVATE_PKG${NC}"

    # Private extensions are loaded via symlinks into the main repo's extensions/ dir,
    # NOT as a separate Pi package. This preserves ../lib/ import resolution against
    # the main repo's extensions/lib/ (e.g., output-box.ts, themeMap.ts).

    # Create symlinks for import resolution (idempotent)
    LINK_TARGETS=("extensions:extensions" "commands:commands" "skills:skills")
    for mapping in "${LINK_TARGETS[@]}"; do
        LOCAL_DIR="${mapping%%:*}"
        REMOTE_DIR="${mapping##*:}"
        LINK_PATH="$SCRIPT_DIR/$LOCAL_DIR/private"
        TARGET_PATH="$PRIVATE_PKG/$REMOTE_DIR"

        if [ -d "$TARGET_PATH" ]; then
            if [ -L "$LINK_PATH" ]; then
                success "${DIM}$LOCAL_DIR/private${NC} symlink exists"
            elif [ -d "$LINK_PATH" ]; then
                warn "${DIM}$LOCAL_DIR/private${NC} is a directory (not a symlink) — skipping"
            else
                if [ "$DRY_RUN" -eq 1 ]; then
                    info "[dry-run] Would symlink ${DIM}$LOCAL_DIR/private${NC} → ${DIM}$TARGET_PATH${NC}"
                else
                    ln -s "$TARGET_PATH" "$LINK_PATH"
                    success "Linked ${DIM}$LOCAL_DIR/private${NC} → ${DIM}$TARGET_PATH${NC}"
                fi
            fi
        fi
    done
else
    info "No private extensions found ${DIM}(create $PRIVATE_PKG to add private extensions)${NC}"
fi

# ═══════════════════════════════════════════════════════════════════
# Step 8: Verify Extensions Exist
# ═══════════════════════════════════════════════════════════════════
step "Verifying extensions"

EXT_COUNT=$(ls extensions/*.ts 2>/dev/null | wc -l | xargs)
if [ "$EXT_COUNT" -gt 0 ]; then
    success "$EXT_COUNT extensions found"
else
    fail "No extensions found in extensions/"
    ERRORS=$((ERRORS + 1))
fi

# ═══════════════════════════════════════════════════════════════════
# Step 9: Verify Themes
# ═══════════════════════════════════════════════════════════════════
step "Verifying themes"

THEME_COUNT=$(ls themes/*.json 2>/dev/null | wc -l | xargs)
if [ "$THEME_COUNT" -gt 0 ]; then
    success "$THEME_COUNT themes available ${DIM}(Ctrl+X to cycle)${NC}"
else
    fail "No themes found in themes/"
    ERRORS=$((ERRORS + 1))
fi

# ═══════════════════════════════════════════════════════════════════
# Step 10: Verify Skills
# ═══════════════════════════════════════════════════════════════════
step "Verifying skills"

SKILL_COUNT=$(find skills -name "SKILL.md" 2>/dev/null | wc -l | xargs)
if [ "$SKILL_COUNT" -gt 0 ]; then
    success "$SKILL_COUNT skills found"
else
    warn "No skills found in skills/"
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
elif [ "$DRY_RUN" -eq 1 ]; then
    echo -e "${YELLOW}${BOLD}  Dry run finished — no changes were made.${NC}"
    echo -e "${DIM}  Run without ${NC}${BOLD}--dry-run${NC}${DIM} to apply.${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════${NC}"
    echo ""
else
    echo -e "${GREEN}${BOLD}  ✓ Installation complete!${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}Quick start:${NC}"
    echo -e "    ${CYAN}pi${NC}  ${DIM}(from any directory)${NC}"
    echo ""
    echo -e "  ${BOLD}Verify anytime:${NC}"
    echo -e "    ${CYAN}./pi-doctor.sh${NC}"
    echo ""
    echo -e "  ${BOLD}Modes:${NC} ${DIM}Ctrl+Shift+M to cycle NORMAL → PLAN → SPEC → PIPELINE → TEAM → CHAIN${NC}"
    echo -e "  ${BOLD}Themes:${NC} ${DIM}Ctrl+X to cycle through $THEME_COUNT themes${NC}"
    echo ""
fi
