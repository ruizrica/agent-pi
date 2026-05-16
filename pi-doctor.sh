#!/usr/bin/env bash
# ABOUTME: Diagnostic tool for the agent-pi extension package.
# ABOUTME: Validates package health, Pi registration, and resource integrity.
# ═══════════════════════════════════════════════════════════════════
# Run anytime to check if your agent setup is healthy.
# Exit code: 0 = all good, 1 = failures found
# ═══════════════════════════════════════════════════════════════════
set -uo pipefail

# ── Colors ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Counters ───────────────────────────────────────────────────────
PASS=0
WARN=0
FAIL=0

# ── Helpers ────────────────────────────────────────────────────────
pass() { echo -e "  ${GREEN}✓${NC}  $1"; PASS=$((PASS + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; WARN=$((WARN + 1)); }
fail() { echo -e "  ${RED}✗${NC}  $1"; FAIL=$((FAIL + 1)); }
section() { echo -e "\n${CYAN}${BOLD}$1${NC}"; }

# ── Resolve directories ──────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PI_AGENT_DIR="$HOME/.pi/agent"

echo -e "\n${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║         pi-doctor — health check         ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"

echo -e "\n  ${DIM}Package:   ${NC}${BOLD}$SCRIPT_DIR${NC}"
echo -e "  ${DIM}Pi config: ${NC}${BOLD}$PI_AGENT_DIR${NC}"

# ═══════════════════════════════════════════════════════════════════
# 1. Runtime Prerequisites
# ═══════════════════════════════════════════════════════════════════
section "Runtime"

# Node.js
if command -v node &>/dev/null; then
    NODE_VER=$(node --version)
    NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        pass "Node.js ${DIM}${NODE_VER}${NC}"
    else
        warn "Node.js ${NODE_VER} — v18+ recommended"
    fi
else
    fail "Node.js not installed"
fi

# npm
if command -v npm &>/dev/null; then
    pass "npm ${DIM}v$(npm --version)${NC}"
else
    fail "npm not installed"
fi

# Pi CLI
if command -v pi &>/dev/null; then
    PI_PATH=$(which pi)
    PI_PKG=$(dirname "$(dirname "$(readlink "$PI_PATH" 2>/dev/null || echo "$PI_PATH")")")/package.json
    if [ -f "$PI_PKG" ]; then
        PI_VER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$PI_PKG','utf-8')).version)" 2>/dev/null || echo "unknown")
        pass "Pi CLI ${DIM}v${PI_VER} → ${PI_PATH}${NC}"
    else
        pass "Pi CLI ${DIM}→ ${PI_PATH}${NC}"
    fi
else
    fail "Pi CLI not found — run: npm install -g @mariozechner/pi-coding-agent"
fi

# git
if command -v git &>/dev/null; then
    pass "git ${DIM}v$(git --version | awk '{print $3}')${NC}"
else
    fail "git not installed"
fi

# ═══════════════════════════════════════════════════════════════════
# 2. Package Registration
# ═══════════════════════════════════════════════════════════════════
section "Package Registration"

SETTINGS_FILE="$PI_AGENT_DIR/settings.json"

if [ -f "$SETTINGS_FILE" ]; then
    if node -e "JSON.parse(require('fs').readFileSync('$SETTINGS_FILE','utf-8'))" 2>/dev/null; then
        pass "Pi settings.json ${DIM}(valid JSON)${NC}"

        # Check if this repo is registered as a package
        IS_REGISTERED=$(node -e "
            const s = JSON.parse(require('fs').readFileSync('$SETTINGS_FILE','utf-8'));
            const pkgs = s.packages || [];
            console.log(pkgs.includes('$SCRIPT_DIR') ? 'yes' : 'no');
        " 2>/dev/null || echo "no")

        if [ "$IS_REGISTERED" = "yes" ]; then
            pass "Package registered in Pi settings"
        else
            fail "Package NOT registered — run: ./install.sh"
        fi
    else
        fail "Pi settings.json contains invalid JSON"
    fi
else
    fail "Missing: $SETTINGS_FILE — run: ./install.sh"
fi

# Verify pi list output
if command -v pi &>/dev/null; then
    PACKAGE_VISIBLE=$(pi list 2>/dev/null | grep -c "$SCRIPT_DIR" || true)
    if [ "$PACKAGE_VISIBLE" -gt 0 ]; then
        pass "Pi recognizes the package"
    else
        fail "Pi does not see this package — check settings.json"
    fi
fi

# ═══════════════════════════════════════════════════════════════════
# 3. Dependencies
# ═══════════════════════════════════════════════════════════════════
section "Dependencies"

# Root node_modules
if [ -d "node_modules" ]; then
    ROOT_DEPS=$(ls node_modules/ 2>/dev/null | wc -l | xargs)
    pass "Root node_modules ${DIM}(${ROOT_DEPS} packages)${NC}"
else
    fail "Root node_modules missing — run: npm install"
fi

# Extension node_modules
if [ -d "extensions/node_modules" ]; then
    EXT_DEPS=$(ls extensions/node_modules/ 2>/dev/null | wc -l | xargs)
    pass "Extension node_modules ${DIM}(${EXT_DEPS} packages)${NC}"
else
    fail "Extension node_modules missing — run: cd extensions && npm install"
fi

# ═══════════════════════════════════════════════════════════════════
# 4. Agent Configs
# ═══════════════════════════════════════════════════════════════════
section "Agent Configs"

CONFIG_DIR="agents"
YAML_MOD="$SCRIPT_DIR/extensions/node_modules/yaml"

# agent-chain.yaml
if [ -f "$CONFIG_DIR/agent-chain.yaml" ]; then
    if node -e "
        const yaml = require('$YAML_MOD');
        const fs = require('fs');
        const doc = yaml.parse(fs.readFileSync('$CONFIG_DIR/agent-chain.yaml', 'utf-8'));
        if (!doc || typeof doc !== 'object') process.exit(1);
    " 2>/dev/null; then
        CHAIN_COUNT=$(node -e "
            const yaml = require('$YAML_MOD');
            const fs = require('fs');
            const doc = yaml.parse(fs.readFileSync('$CONFIG_DIR/agent-chain.yaml', 'utf-8'));
            console.log(Object.keys(doc).length);
        " 2>/dev/null || echo "?")
        pass "agent-chain.yaml ${DIM}(${CHAIN_COUNT} chains)${NC}"
    else
        fail "agent-chain.yaml exists but contains invalid YAML"
    fi
else
    fail "Missing: $CONFIG_DIR/agent-chain.yaml"
fi

# pipeline-team.yaml
if [ -f "$CONFIG_DIR/pipeline-team.yaml" ]; then
    if node -e "
        const yaml = require('$YAML_MOD');
        const fs = require('fs');
        const doc = yaml.parse(fs.readFileSync('$CONFIG_DIR/pipeline-team.yaml', 'utf-8'));
        if (!doc || typeof doc !== 'object') process.exit(1);
    " 2>/dev/null; then
        PIPELINE_COUNT=$(node -e "
            const yaml = require('$YAML_MOD');
            const fs = require('fs');
            const doc = yaml.parse(fs.readFileSync('$CONFIG_DIR/pipeline-team.yaml', 'utf-8'));
            console.log(Object.keys(doc).length);
        " 2>/dev/null || echo "?")
        pass "pipeline-team.yaml ${DIM}(${PIPELINE_COUNT} pipelines)${NC}"
    else
        fail "pipeline-team.yaml exists but contains invalid YAML"
    fi
else
    fail "Missing: $CONFIG_DIR/pipeline-team.yaml"
fi

# teams.yaml
if [ -f "$CONFIG_DIR/teams.yaml" ]; then
    TEAM_COUNT=$(node -e "
        const yaml = require('$YAML_MOD');
        const fs = require('fs');
        const doc = yaml.parse(fs.readFileSync('$CONFIG_DIR/teams.yaml', 'utf-8'));
        console.log(Object.keys(doc).length);
    " 2>/dev/null || echo "?")
    pass "teams.yaml ${DIM}(${TEAM_COUNT} teams)${NC}"
else
    warn "Missing: $CONFIG_DIR/teams.yaml ${DIM}(optional)${NC}"
fi

# ═══════════════════════════════════════════════════════════════════
# 5. Agent Definitions
# ═══════════════════════════════════════════════════════════════════
section "Agent Definitions"

CORE_AGENTS=("builder" "reviewer" "scout" "planner" "tester")
FOUND_AGENTS=0

for agent_name in "${CORE_AGENTS[@]}"; do
    if [ -f "$CONFIG_DIR/${agent_name}.md" ]; then
        FOUND_AGENTS=$((FOUND_AGENTS + 1))
    else
        fail "Missing core agent: ${agent_name}.md"
    fi
done

# Count all agent .md files
TOTAL_AGENTS=0
if [ -d "$CONFIG_DIR" ]; then
    TOTAL_AGENTS=$(find "$CONFIG_DIR" -name "*.md" -type f 2>/dev/null | wc -l | xargs)
fi

if [ "$FOUND_AGENTS" -eq "${#CORE_AGENTS[@]}" ]; then
    pass "Core agents present ${DIM}(${FOUND_AGENTS}/${#CORE_AGENTS[@]})${NC}"
fi
if [ "$TOTAL_AGENTS" -gt 0 ]; then
    pass "Total agent definitions: ${DIM}${TOTAL_AGENTS}${NC}"
fi

# ═══════════════════════════════════════════════════════════════════
# 6. Symlinks
# ═══════════════════════════════════════════════════════════════════
section "Symlinks"

BROKEN_COUNT=0
VALID_COUNT=0
while IFS= read -r -d '' link; do
    if [ -e "$link" ]; then
        VALID_COUNT=$((VALID_COUNT + 1))
    else
        TARGET=$(readlink "$link")
        fail "Broken symlink: ${DIM}$link → $TARGET${NC}"
        BROKEN_COUNT=$((BROKEN_COUNT + 1))
    fi
done < <(find "$SCRIPT_DIR" -maxdepth 3 -type l -print0 2>/dev/null)

if [ "$BROKEN_COUNT" -eq 0 ] && [ "$VALID_COUNT" -eq 0 ]; then
    pass "No symlinks ${DIM}(none needed)${NC}"
elif [ "$BROKEN_COUNT" -eq 0 ]; then
    pass "All symlinks valid ${DIM}(${VALID_COUNT})${NC}"
fi

# ═══════════════════════════════════════════════════════════════════
# 7. Pi Runtime Config
# ═══════════════════════════════════════════════════════════════════
section "Pi Runtime Config"

if [ -f "$PI_AGENT_DIR/models.json" ]; then
    if node -e "JSON.parse(require('fs').readFileSync('$PI_AGENT_DIR/models.json','utf-8'))" 2>/dev/null; then
        PROVIDER_COUNT=$(node -e "
            const m = JSON.parse(require('fs').readFileSync('$PI_AGENT_DIR/models.json','utf-8'));
            console.log(Object.keys(m.providers || {}).length);
        " 2>/dev/null || echo "?")
        pass "models.json ${DIM}(${PROVIDER_COUNT} providers)${NC}"
    else
        fail "models.json contains invalid JSON"
    fi
else
    warn "models.json missing ${DIM}— multi-provider support disabled${NC}"
fi

if [ -f "$PI_AGENT_DIR/auth.json" ]; then
    pass "auth.json ${DIM}present${NC}"
else
    warn "auth.json missing ${DIM}— OAuth not configured${NC}"
fi

# ═══════════════════════════════════════════════════════════════════
# 8. Extensions
# ═══════════════════════════════════════════════════════════════════
section "Extensions"

EXT_COUNT=$(ls extensions/*.ts 2>/dev/null | wc -l | xargs)
if [ "$EXT_COUNT" -gt 0 ]; then
    pass "Extensions found ${DIM}(${EXT_COUNT} .ts files)${NC}"
else
    fail "No extensions found in extensions/"
fi

if [ -d "extensions/private" ]; then
	PACIFICO_COUNT=$(find extensions/private -maxdepth 1 -iname "*pacifico*" 2>/dev/null | wc -l | xargs)
	if [ "$PACIFICO_COUNT" -gt 0 ]; then
		warn "Pacifico private extension detected in ${DIM}extensions/private${NC} — remove/disable it to avoid API key warnings"
	fi
fi

# ═══════════════════════════════════════════════════════════════════
# 9. Themes
# ═══════════════════════════════════════════════════════════════════
section "Themes"

THEME_COUNT=$(ls themes/*.json 2>/dev/null | wc -l | xargs)
if [ "$THEME_COUNT" -gt 0 ]; then
    pass "Themes installed ${DIM}(${THEME_COUNT})${NC}"
else
    warn "No theme files found in themes/"
fi

# ═══════════════════════════════════════════════════════════════════
# 10. Skills
# ═══════════════════════════════════════════════════════════════════
section "Skills"

SKILL_COUNT=0
for skill_dir in skills/*/; do
    if [ -f "${skill_dir}SKILL.md" ] || [ -f "${skill_dir}SKILL.md.disabled" ]; then
        SKILL_COUNT=$((SKILL_COUNT + 1))
    fi
done 2>/dev/null

if [ "$SKILL_COUNT" -gt 0 ]; then
    pass "Skills available ${DIM}(${SKILL_COUNT})${NC}"
else
    warn "No skill packs found"
fi

# ═══════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "  ${GREEN}✓ ${PASS} passed${NC}   ${YELLOW}⚠ ${WARN} warnings${NC}   ${RED}✗ ${FAIL} failures${NC}"
echo -e "${BOLD}═══════════════════════════════════════════${NC}"

if [ "$FAIL" -gt 0 ]; then
    echo -e "\n  ${RED}${BOLD}Health check failed.${NC}"
    echo -e "  ${DIM}Run ${NC}${BOLD}./install.sh${NC}${DIM} to fix issues, or resolve manually.${NC}\n"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo -e "\n  ${YELLOW}${BOLD}Healthy with warnings.${NC}"
    echo -e "  ${DIM}Warnings are non-critical but may limit functionality.${NC}\n"
    exit 0
else
    echo -e "\n  ${GREEN}${BOLD}All systems healthy!${NC}"
    echo -e "  ${DIM}Start with: pi${NC}\n"
    exit 0
fi
