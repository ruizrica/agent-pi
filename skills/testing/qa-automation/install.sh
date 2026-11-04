#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  install.sh — QA Automation Dependency Checker & Installer        ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  Checks for all required tools and installs any that are missing. ║
# ║                                                                   ║
# ║  Usage:                                                           ║
# ║    bash install.sh           # Check + install missing            ║
# ║    bash install.sh --check   # Check only, don't install          ║
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

CHECK_ONLY=false
if [ "${1:-}" = "--check" ]; then
    CHECK_ONLY=true
fi

# ── Colors ───────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
INSTALLED_COUNT=0

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  QA Automation — Dependency Check & Install              ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Helper Functions ─────────────────────────────────────────────────

check_ok() {
    echo -e "  ${GREEN}✅${RESET} $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

check_fail() {
    echo -e "  ${RED}❌${RESET} $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

check_warn() {
    echo -e "  ${YELLOW}⚠️${RESET}  $1"
}

check_install() {
    echo -e "  ${CYAN}📦${RESET} $1"
    INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
}

section() {
    echo ""
    echo -e "${BOLD}── $1 ──${RESET}"
}

# ── 1. Node.js ───────────────────────────────────────────────────────
section "Runtime"

if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version 2>/dev/null || echo "unknown")
    check_ok "Node.js ${NODE_VERSION}"
else
    check_fail "Node.js — not found"
    echo "         Install: https://nodejs.org or 'brew install node'"
fi

if command -v npm >/dev/null 2>&1; then
    NPM_VERSION=$(npm --version 2>/dev/null || echo "unknown")
    check_ok "npm ${NPM_VERSION}"
else
    check_fail "npm — not found (usually installed with Node.js)"
fi

if command -v npx >/dev/null 2>&1; then
    check_ok "npx available"
else
    check_fail "npx — not found (usually installed with Node.js)"
fi

# ── 2. agent-device ──────────────────────────────────────────────────
section "agent-device (Native App Testing)"

if command -v agent-device >/dev/null 2>&1; then
    AD_VERSION=$(agent-device --version 2>/dev/null || echo "unknown")
    check_ok "agent-device ${AD_VERSION}"
else
    check_fail "agent-device — not installed"
    if [ "$CHECK_ONLY" = false ]; then
        echo -e "         ${CYAN}Installing agent-device...${RESET}"
        if npm install -g agent-device 2>/dev/null; then
            check_install "agent-device installed successfully"
        else
            check_warn "Install failed. Try: npm install -g agent-device"
        fi
    else
        echo "         Install: npm install -g agent-device"
    fi
fi

# ── 3. agent-browser ─────────────────────────────────────────────────
section "agent-browser (Web App Testing)"

if command -v agent-browser >/dev/null 2>&1; then
    AB_VERSION=$(agent-browser --version 2>/dev/null || echo "unknown")
    check_ok "agent-browser ${AB_VERSION}"
else
    check_fail "agent-browser — not installed"
    if [ "$CHECK_ONLY" = false ]; then
        echo -e "         ${CYAN}Installing agent-browser...${RESET}"
        if npm install -g agent-browser 2>/dev/null; then
            check_install "agent-browser installed successfully"
        else
            check_warn "Install failed. Try: npm install -g agent-browser"
        fi
    else
        echo "         Install: npm install -g agent-browser"
    fi
fi

# ── 4. WebSocket library (for CDP) ───────────────────────────────────
section "CDP Dependencies"

# Check if 'ws' is available (needed for CDP WebSocket connections)
WS_AVAILABLE=false
if node -e "require('ws')" 2>/dev/null; then
    WS_VERSION=$(node -e "console.log(require('ws/package.json').version)" 2>/dev/null || echo "unknown")
    check_ok "ws (WebSocket) ${WS_VERSION}"
    WS_AVAILABLE=true
else
    check_fail "ws (WebSocket) — not installed"
    if [ "$CHECK_ONLY" = false ]; then
        echo -e "         ${CYAN}Installing ws...${RESET}"
        if npm install -g ws 2>/dev/null; then
            check_install "ws installed globally"
            WS_AVAILABLE=true
        else
            # Try installing locally in project
            echo "         Global install failed. Trying local install..."
            if npm install ws 2>/dev/null; then
                check_install "ws installed locally"
                WS_AVAILABLE=true
            else
                check_warn "Install failed. Run: npm install ws"
            fi
        fi
    else
        echo "         Install: npm install ws (in your project)"
    fi
fi

# ── 5. iOS Development Tools ─────────────────────────────────────────
section "iOS (optional — for native iOS testing)"

if command -v xcrun >/dev/null 2>&1; then
    XCODE_VERSION=$(xcodebuild -version 2>/dev/null | head -1 || echo "unknown")
    check_ok "Xcode / xcrun ($XCODE_VERSION)"

    # Check for simulators
    SIM_COUNT=$(xcrun simctl list devices available 2>/dev/null | grep -c "iPhone\|iPad" || echo "0")
    if [ "$SIM_COUNT" -gt 0 ]; then
        check_ok "iOS Simulators available ($SIM_COUNT devices)"
    else
        check_warn "No iOS simulators found. Create one via Xcode → Window → Devices and Simulators"
    fi
else
    check_warn "Xcode / xcrun — not found (needed for iOS simulator testing)"
    echo "         Install Xcode from the Mac App Store"
fi

# ── 6. Android Development Tools ─────────────────────────────────────
section "Android (optional — for native Android testing)"

ADB_FOUND=false
if command -v adb >/dev/null 2>&1; then
    ADB_VERSION=$(adb --version 2>/dev/null | head -1 || echo "unknown")
    check_ok "adb ($ADB_VERSION)"
    ADB_FOUND=true
elif [ -f "$HOME/Library/Android/sdk/platform-tools/adb" ]; then
    check_ok "adb (found at ~/Library/Android/sdk/platform-tools/adb)"
    ADB_FOUND=true
else
    check_warn "adb — not found (needed for Android emulator testing)"
    echo "         Install Android Studio or: brew install android-platform-tools"
fi

if [ -f "$HOME/Library/Android/sdk/emulator/emulator" ]; then
    check_ok "Android Emulator available"
else
    check_warn "Android Emulator — not found at default SDK path"
fi

# ── 7. Shell Environment ─────────────────────────────────────────────
section "Shell"

BASH_VERSION_STR=$(bash --version | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "unknown")
BASH_MAJOR=$(echo "$BASH_VERSION_STR" | cut -d. -f1)

if [ "$BASH_MAJOR" -ge 4 ] 2>/dev/null; then
    check_ok "Bash ${BASH_VERSION_STR} (4.0+ required for arrays)"
else
    check_warn "Bash ${BASH_VERSION_STR} — version 4.0+ recommended"
    echo "         Install: brew install bash"
fi

if command -v curl >/dev/null 2>&1; then
    check_ok "curl available"
else
    check_fail "curl — not found"
fi

if command -v jq >/dev/null 2>&1; then
    check_ok "jq available (JSON processing)"
else
    check_warn "jq — not found (optional, for JSON parsing)"
    echo "         Install: brew install jq"
fi

# ── Summary ──────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

TOTAL=$((PASS_COUNT + FAIL_COUNT))
echo -e "  ${GREEN}Passed:${RESET}    $PASS_COUNT / $TOTAL"
if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "  ${RED}Failed:${RESET}    $FAIL_COUNT"
fi
if [ $INSTALLED_COUNT -gt 0 ]; then
    echo -e "  ${CYAN}Installed:${RESET} $INSTALLED_COUNT"
fi

echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}All required dependencies are available! ✅${RESET}"
    echo ""
    echo "  Next steps:"
    echo "    1. Copy qa.config.sh and set your app-specific values"
    echo "    2. Run: bash qa-scroll/run.sh  (or any skill runner)"
    echo ""
    exit 0
else
    CRITICAL_MISSING=""
    if ! command -v agent-device >/dev/null 2>&1; then
        CRITICAL_MISSING="$CRITICAL_MISSING agent-device"
    fi
    if ! command -v agent-browser >/dev/null 2>&1; then
        CRITICAL_MISSING="$CRITICAL_MISSING agent-browser"
    fi
    if ! command -v node >/dev/null 2>&1; then
        CRITICAL_MISSING="$CRITICAL_MISSING node"
    fi

    if [ -n "$CRITICAL_MISSING" ]; then
        echo -e "  ${RED}${BOLD}Missing critical dependencies:${RESET}${CRITICAL_MISSING}"
        echo ""
        echo "  Install them and re-run: bash install.sh"
        echo ""
        exit 1
    else
        echo -e "  ${YELLOW}Some optional tools are missing, but core functionality is available.${RESET}"
        echo ""
        exit 0
    fi
fi
