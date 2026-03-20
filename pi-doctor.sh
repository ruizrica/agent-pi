#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# pi-doctor — validate agent installation health
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

# ── Resolve script directory ───────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "\n${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║         pi-doctor — health check         ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"

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
    # Try to get version
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
# 2. Dependencies
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
if [ -d "agent/extensions/node_modules" ]; then
    EXT_DEPS=$(ls agent/extensions/node_modules/ 2>/dev/null | wc -l | xargs)
    pass "Extension node_modules ${DIM}(${EXT_DEPS} packages)${NC}"
else
    fail "Extension node_modules missing — run: cd agent/extensions && npm install"
fi

# ═══════════════════════════════════════════════════════════════════
# 3. Agent Configuration Files
# ═══════════════════════════════════════════════════════════════════
section "Agent Configs"

AGENT_DIR="agent/.pi/agents"

# agent-chain.yaml
if [ -f "$AGENT_DIR/agent-chain.yaml" ]; then
    # Validate YAML is parseable
    if node -e "
        const yaml = require('$SCRIPT_DIR/agent/extensions/node_modules/yaml');
        const fs = require('fs');
        const doc = yaml.parse(fs.readFileSync('$AGENT_DIR/agent-chain.yaml', 'utf-8'));
        if (!doc || typeof doc !== 'object') process.exit(1);
    " 2>/dev/null; then
        CHAIN_COUNT=$(node -e "
            const yaml = require('$SCRIPT_DIR/agent/extensions/node_modules/yaml');
            const fs = require('fs');
            const doc = yaml.parse(fs.readFileSync('$AGENT_DIR/agent-chain.yaml', 'utf-8'));
            console.log(Object.keys(doc).length);
        " 2>/dev/null || echo "?")
        pass "agent-chain.yaml ${DIM}(${CHAIN_COUNT} chains)${NC}"
    else
        fail "agent-chain.yaml exists but contains invalid YAML"
    fi
else
    fail "Missing: $AGENT_DIR/agent-chain.yaml"
fi

# pipeline-team.yaml
if [ -f "$AGENT_DIR/pipeline-team.yaml" ]; then
    if node -e "
        const yaml = require('$SCRIPT_DIR/agent/extensions/node_modules/yaml');
        const fs = require('fs');
        const doc = yaml.parse(fs.readFileSync('$AGENT_DIR/pipeline-team.yaml', 'utf-8'));
        if (!doc || typeof doc !== 'object') process.exit(1);
    " 2>/dev/null; then
        PIPELINE_COUNT=$(node -e "
            const yaml = require('$SCRIPT_DIR/agent/extensions/node_modules/yaml');
            const fs = require('fs');
            const doc = yaml.parse(fs.readFileSync('$AGENT_DIR/pipeline-team.yaml', 'utf-8'));
            console.log(Object.keys(doc).length);
        " 2>/dev/null || echo "?")
        pass "pipeline-team.yaml ${DIM}(${PIPELINE_COUNT} pipelines)${NC}"
    else
        fail "pipeline-team.yaml exists but contains invalid YAML"
    fi
else
    fail "Missing: $AGENT_DIR/pipeline-team.yaml"
fi

# teams.yaml
if [ -f "$AGENT_DIR/teams.yaml" ]; then
    TEAM_COUNT=$(node -e "
        const yaml = require('$SCRIPT_DIR/agent/extensions/node_modules/yaml');
        const fs = require('fs');
        const doc = yaml.parse(fs.readFileSync('$AGENT_DIR/teams.yaml', 'utf-8'));
        console.log(Object.keys(doc).length);
    " 2>/dev/null || echo "?")
    pass "teams.yaml ${DIM}(${TEAM_COUNT} teams)${NC}"
else
    warn "Missing: $AGENT_DIR/teams.yaml ${DIM}(optional)${NC}"
fi

# ═══════════════════════════════════════════════════════════════════
# 4. Agent Definitions
# ═══════════════════════════════════════════════════════════════════
section "Agent Definitions"

CORE_AGENTS=("builder" "reviewer" "scout" "planner" "tester")
FOUND_AGENTS=0
TOTAL_AGENTS=0

for agent_name in "${CORE_AGENTS[@]}"; do
    if [ -f "$AGENT_DIR/${agent_name}.md" ]; then
        FOUND_AGENTS=$((FOUND_AGENTS + 1))
    else
        fail "Missing core agent: ${agent_name}.md"
    fi
done

# Count all agent .md files
if [ -d "$AGENT_DIR" ]; then
    TOTAL_AGENTS=$(find "$AGENT_DIR" -name "*.md" -type f 2>/dev/null | wc -l | xargs)
fi

if [ "$FOUND_AGENTS" -eq "${#CORE_AGENTS[@]}" ]; then
    pass "Core agents present ${DIM}(${FOUND_AGENTS}/${#CORE_AGENTS[@]})${NC}"
fi
if [ "$TOTAL_AGENTS" -gt 0 ]; then
    pass "Total agent definitions: ${DIM}${TOTAL_AGENTS}${NC}"
fi

# ═══════════════════════════════════════════════════════════════════
# 5. Symlink Health
# ═══════════════════════════════════════════════════════════════════
section "Symlinks"

BROKEN_COUNT=0
VALID_COUNT=0
while IFS= read -r -d '' link; do
    if [ -e "$link" ]; then
        TARGET=$(readlink "$link")
        VALID_COUNT=$((VALID_COUNT + 1))
    else
        TARGET=$(readlink "$link")
        fail "Broken symlink: ${DIM}$link → $TARGET${NC}"
        BROKEN_COUNT=$((BROKEN_COUNT + 1))
    fi
done < <(find "$AGENT_DIR" -type l -print0 2>/dev/null)

if [ "$BROKEN_COUNT" -eq 0 ] && [ "$VALID_COUNT" -eq 0 ]; then
    pass "No symlinks ${DIM}(none needed)${NC}"
elif [ "$BROKEN_COUNT" -eq 0 ]; then
    pass "All symlinks valid ${DIM}(${VALID_COUNT})${NC}"
fi

# ═══════════════════════════════════════════════════════════════════
# 6. Model Configuration
# ═══════════════════════════════════════════════════════════════════
section "Models"

if [ -f "agent/models.json" ]; then
    if node -e "JSON.parse(require('fs').readFileSync('agent/models.json','utf-8'))" 2>/dev/null; then
        PROVIDER_COUNT=$(node -e "
            const m = JSON.parse(require('fs').readFileSync('agent/models.json','utf-8'));
            console.log(Object.keys(m.providers || {}).length);
        " 2>/dev/null || echo "?")
        pass "models.json ${DIM}(${PROVIDER_COUNT} providers)${NC}"
    else
        fail "models.json contains invalid JSON"
    fi
else
    warn "models.json missing ${DIM}— multi-provider support disabled${NC}"
    if [ -f "agent/models.json.template" ]; then
        echo -e "        ${DIM}Copy template: cp agent/models.json.template agent/models.json${NC}"
    fi
fi

# ═══════════════════════════════════════════════════════════════════
# 7. Settings & Extensions
# ═══════════════════════════════════════════════════════════════════
section "Settings & Extensions"

if [ -f "agent/settings.json" ]; then
    if node -e "JSON.parse(require('fs').readFileSync('agent/settings.json','utf-8'))" 2>/dev/null; then
        pass "settings.json ${DIM}(valid JSON)${NC}"
    else
        fail "settings.json contains invalid JSON"
    fi
else
    fail "Missing: agent/settings.json"
fi

# Check extensions
MISSING_EXT=0
TOTAL_EXT=0
if [ -f "agent/settings.json" ]; then
    while IFS= read -r ext_path; do
        ext_path=$(echo "$ext_path" | tr -d '",' | xargs)
        if [ -n "$ext_path" ] && [[ "$ext_path" == extensions/* ]]; then
            TOTAL_EXT=$((TOTAL_EXT + 1))
            if [ ! -f "agent/$ext_path" ]; then
                fail "Missing extension: ${DIM}agent/$ext_path${NC}"
                MISSING_EXT=$((MISSING_EXT + 1))
            fi
        fi
    done < <(node -e "
        const s = JSON.parse(require('fs').readFileSync('agent/settings.json','utf-8'));
        if (s.packages) s.packages.forEach(p => console.log(p));
    " 2>/dev/null)
fi

if [ "$MISSING_EXT" -eq 0 ] && [ "$TOTAL_EXT" -gt 0 ]; then
    pass "All extensions present ${DIM}(${TOTAL_EXT})${NC}"
fi

# ═══════════════════════════════════════════════════════════════════
# 8. Themes
# ═══════════════════════════════════════════════════════════════════
section "Themes"

if [ -d "agent/themes" ]; then
    THEME_COUNT=$(ls agent/themes/*.json 2>/dev/null | wc -l | xargs)
    if [ "$THEME_COUNT" -gt 0 ]; then
        pass "Themes installed ${DIM}(${THEME_COUNT})${NC}"
    else
        warn "No theme files found in agent/themes/"
    fi
else
    warn "agent/themes/ directory missing"
fi

# ═══════════════════════════════════════════════════════════════════
# 9. Skills
# ═══════════════════════════════════════════════════════════════════
section "Skills"

SKILL_COUNT=0
for skill_dir in agent/skills/*/; do
    if [ -f "${skill_dir}SKILL.md" ] || [ -f "${skill_dir}SKILL.md.disabled" ]; then
        SKILL_COUNT=$((SKILL_COUNT + 1))
    fi
done
for skill_dir in skills/*/; do
    if [ -f "${skill_dir}SKILL.md" ]; then
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
    echo -e "\n  ${GREEN}${BOLD}All systems healthy! 🎉${NC}"
    echo -e "  ${DIM}Start with: cd agent && pi${NC}\n"
    exit 0
fi
