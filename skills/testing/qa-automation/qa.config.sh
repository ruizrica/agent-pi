#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  qa.config.sh — Central Configuration for QA Automation Skills   ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  Source this file at the top of every QA script:                  ║
# ║    source "$(dirname "$0")/../qa.config.sh"                      ║
# ║                                                                   ║
# ║  Override any variable by exporting it before sourcing:           ║
# ║    export APP_BUNDLE_ID="com.myapp.dev"                          ║
# ║    source qa.config.sh                                            ║
# ║                                                                   ║
# ║  Or create a local override file:                                 ║
# ║    qa.config.local.sh (gitignored, sourced automatically)        ║
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Resolve paths ────────────────────────────────────────────────────
QA_AUTOMATION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── App Configuration ────────────────────────────────────────────────
# Bundle/package identifier for your app (dev build)
export APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.example.app.dev}"

# Bundle/package identifier for production builds
export APP_BUNDLE_ID_PROD="${APP_BUNDLE_ID_PROD:-com.example.app}"

# Project root directory (where package.json lives)
export PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"

# ── iOS Simulator ────────────────────────────────────────────────────
# Simulator UDID — set to "auto" to detect the first booted simulator
export SIMULATOR_UDID="${SIMULATOR_UDID:-auto}"

# Simulator device name (used when creating/finding simulators)
export SIMULATOR_DEVICE_NAME="${SIMULATOR_DEVICE_NAME:-iPhone 16 Pro}"

# ── Android Emulator ─────────────────────────────────────────────────
# Android AVD name
export ANDROID_AVD="${ANDROID_AVD:-Pixel_8}"

# Android serial — set to "auto" to detect the first running emulator
export ANDROID_SERIAL="${ANDROID_SERIAL:-auto}"

# Android SDK paths
export ANDROID_SDK="${ANDROID_SDK:-$HOME/Library/Android/sdk}"
export ADB_PATH="${ADB_PATH:-$ANDROID_SDK/platform-tools/adb}"
export EMULATOR_PATH="${EMULATOR_PATH:-$ANDROID_SDK/emulator/emulator}"

# ── Dev Server / Metro ───────────────────────────────────────────────
# Port for the dev server (Metro bundler, Vite, webpack, etc.)
export METRO_PORT="${METRO_PORT:-8081}"

# URL for the dev server
export METRO_URL="${METRO_URL:-http://localhost:${METRO_PORT}}"

# Command to start the dev server (run from PROJECT_DIR)
export DEV_SERVER_CMD="${DEV_SERVER_CMD:-npx expo start --port $METRO_PORT}"

# Health check endpoint (returns 200 when server is ready)
export DEV_SERVER_HEALTH="${DEV_SERVER_HEALTH:-${METRO_URL}/status}"

# ── CDP (Chrome DevTools Protocol) ───────────────────────────────────
# CDP discovery URL (Metro exposes debug targets here)
export CDP_DISCOVERY_URL="${CDP_DISCOVERY_URL:-${METRO_URL}/json}"

# CDP WebSocket URL — set to "auto" for auto-discovery via /json endpoint
export CDP_WS_URL="${CDP_WS_URL:-auto}"

# CDP device ID — set to "auto" to pick from /json response
export CDP_DEVICE_ID="${CDP_DEVICE_ID:-auto}"

# ── Navigation ───────────────────────────────────────────────────────
# React Navigation module ID cache file
export NAV_MODULE_CACHE="${NAV_MODULE_CACHE:-/tmp/qa-nav-module-id}"

# Video/media player module cache file
export VIDEO_MODULE_CACHE="${VIDEO_MODULE_CACHE:-/tmp/qa-video-module-id}"

# Module scan range for auto-discovery (start, end)
export MODULE_SCAN_START="${MODULE_SCAN_START:-0}"
export MODULE_SCAN_END="${MODULE_SCAN_END:-5000}"

# ── Screen Names (configure per app) ────────────────────────────────
# These are used by CDP navigation helpers. Set them to your app's
# React Navigation screen names. Leave empty to skip.
export SCREEN_HOME="${SCREEN_HOME:-HomeScreen}"
export SCREEN_EXPLORE="${SCREEN_EXPLORE:-ExploreScreen}"
export SCREEN_SEARCH="${SCREEN_SEARCH:-SearchScreen}"
export SCREEN_PROFILE="${SCREEN_PROFILE:-ProfileScreen}"
export SCREEN_SETTINGS="${SCREEN_SETTINGS:-SettingsScreen}"

# Tab navigator name (for BottomTab-style navigation)
export TAB_NAVIGATOR_NAME="${TAB_NAVIGATOR_NAME:-BottomTab}"

# ── Coordinate System ────────────────────────────────────────────────
# Override these for your specific device's logical point dimensions.
# Default: iPhone 16 Pro logical resolution (402 × 874 points)
export SCREEN_WIDTH="${SCREEN_WIDTH:-402}"
export SCREEN_HEIGHT="${SCREEN_HEIGHT:-874}"
export SCREEN_SCALE="${SCREEN_SCALE:-3}"

# Tab bar Y position (bottom of screen, above safe area)
export TAB_BAR_Y="${TAB_BAR_Y:-855}"

# Tab positions (x coordinates, left to right)
# Set these to match your app's bottom tab layout
export TAB_1_X="${TAB_1_X:-60}"
export TAB_2_X="${TAB_2_X:-170}"
export TAB_3_X="${TAB_3_X:-290}"
export TAB_4_X="${TAB_4_X:-400}"
export TAB_5_X="${TAB_5_X:-520}"

# Common UI element coordinates
export BACK_BUTTON_X="${BACK_BUTTON_X:-30}"
export BACK_BUTTON_Y="${BACK_BUTTON_Y:-60}"
export SETTINGS_BUTTON_X="${SETTINGS_BUTTON_X:-510}"
export SETTINGS_BUTTON_Y="${SETTINGS_BUTTON_Y:-140}"

# ── Video/Media Player ──────────────────────────────────────────────
# Class name to look for when installing debug hooks
# For expo-video: "VideoPlayer" (looks for m.default.VideoPlayer or m.VideoPlayer)
export VIDEO_PLAYER_CLASS="${VIDEO_PLAYER_CLASS:-VideoPlayer}"

# Global variable name for tracking video player instances
export GLOBAL_PLAYERS_VAR="${GLOBAL_PLAYERS_VAR:-__qaVideoPlayers}"

# Global variable name for feed state debug hook
export GLOBAL_FEED_VAR="${GLOBAL_FEED_VAR:-__qaFeedState}"

# Maximum tracked player instances (prevents memory leaks)
export MAX_TRACKED_PLAYERS="${MAX_TRACKED_PLAYERS:-20}"

# ── Feed/List State (for state persistence tests) ───────────────────
# Property name to test for state persistence (e.g., "isLiked", "isBookmarked", "isInCart")
export STATE_PROPERTY="${STATE_PROPERTY:-isLiked}"

# Counter property that accompanies the state (e.g., "likesCount", "saveCount")
export STATE_COUNTER_PROPERTY="${STATE_COUNTER_PROPERTY:-likesCount}"

# Number of items to scroll through before checking persistence
export STATE_SCROLL_COUNT="${STATE_SCROLL_COUNT:-5}"

# ── Output & Reporting ──────────────────────────────────────────────
# Base directory for test output
export TEST_OUTPUT_DIR="${TEST_OUTPUT_DIR:-/tmp/qa-tests}"

# Screenshot subdirectory
export SCREENSHOT_DIR="${SCREENSHOT_DIR:-$TEST_OUTPUT_DIR/screenshots}"

# Test results log
export RESULTS_FILE="${RESULTS_FILE:-$TEST_OUTPUT_DIR/results.log}"

# ── Timeouts ─────────────────────────────────────────────────────────
# Dev server startup timeout (seconds)
export DEV_SERVER_TIMEOUT="${DEV_SERVER_TIMEOUT:-60}"

# CDP target discovery timeout (seconds)
export CDP_TIMEOUT="${CDP_TIMEOUT:-30}"

# App settle time after launch (seconds)
export APP_SETTLE_TIME="${APP_SETTLE_TIME:-6}"

# agent-device command timeout (seconds)
export DEVICE_CMD_TIMEOUT="${DEVICE_CMD_TIMEOUT:-5}"

# ── Native Platform Selection / agent-device Sessions ───────────────
# iOS session name
export IOS_SESSION="${IOS_SESSION:-default}"
# Android session name
export ANDROID_SESSION="${ANDROID_SESSION:-android}"
# Android emulator boot timeout (seconds)
export ANDROID_BOOT_TIMEOUT="${ANDROID_BOOT_TIMEOUT:-90}"
# Platform for a single native test run: ios or android.
export QA_PLATFORM="${QA_PLATFORM:-ios}"
# Platforms run by skill entrypoints by default. Use "ios", "android", or "both"/"ios android".
export QA_PLATFORMS="${QA_PLATFORMS:-ios android}"

qa_normalize_platform() {
case "$(echo "${1:-ios}" | tr '[:upper:]' '[:lower:]')" in
ios|iphone|simulator) echo "ios" ;;
android|emulator) echo "android" ;;
*) echo "Unsupported QA platform: ${1:-}" >&2; return 1 ;;
esac
}

qa_expand_platforms() {
local requested="${1:-${QA_PLATFORMS:-ios android}}"
requested="$(echo "$requested" | tr ',' ' ' | tr '[:upper:]' '[:lower:]')"
case "$requested" in
both|all) echo "ios android"; return 0 ;;
esac
local item normalized platforms=""
for item in $requested; do
case "$item" in
both|all)
platforms="${platforms:+$platforms }ios android"
;;
*)
normalized=$(qa_normalize_platform "$item") || return 1
platforms="${platforms:+$platforms }$normalized"
;;
esac
done
if [ -z "$platforms" ]; then
platforms="ios android"
fi
echo "$platforms"
}

qa_platform_session() {
local platform
platform=$(qa_normalize_platform "${1:-$QA_PLATFORM}") || return 1
case "$platform" in
android) echo "$ANDROID_SESSION" ;;
*) echo "$IOS_SESSION" ;;
esac
}

_QA_NORMALIZED_PLATFORM=$(qa_normalize_platform "$QA_PLATFORM") || exit 1
export QA_PLATFORM="$_QA_NORMALIZED_PLATFORM"
unset _QA_NORMALIZED_PLATFORM

qa_is_ios() { [ "${QA_PLATFORM:-ios}" = "ios" ]; }
qa_is_android() { [ "${QA_PLATFORM:-ios}" = "android" ]; }

# Active agent-device session. If the caller did not set ACTIVE_SESSION,
# choose the platform-specific default.
if [ -z "${ACTIVE_SESSION+x}" ]; then
if qa_is_android; then
export ACTIVE_SESSION="$ANDROID_SESSION"
else
export ACTIVE_SESSION="$IOS_SESSION"
fi
else
export ACTIVE_SESSION
fi
# ── Web Testing (agent-browser) ─────────────────────────────────────
# Base URL for web testing
export WEB_BASE_URL="${WEB_BASE_URL:-http://localhost:3000}"

# Browser session name
export WEB_SESSION="${WEB_SESSION:-qa}"

# Default viewport for web tests
export WEB_VIEWPORT_WIDTH="${WEB_VIEWPORT_WIDTH:-1280}"
export WEB_VIEWPORT_HEIGHT="${WEB_VIEWPORT_HEIGHT:-720}"

# ── Auto-Detection Functions ─────────────────────────────────────────

# Auto-detect simulator UDID (finds first booted iOS simulator)
qa_detect_simulator_udid() {
    if [ "$SIMULATOR_UDID" != "auto" ]; then
        echo "$SIMULATOR_UDID"
        return 0
    fi

    local udid
    udid=$(xcrun simctl list devices 2>/dev/null | grep "Booted" | head -1 | grep -oE '[A-F0-9-]{36}' || echo "")

    if [ -n "$udid" ]; then
        export SIMULATOR_UDID="$udid"
        echo "$udid"
        return 0
    fi

    echo ""
    return 1
}

# Auto-detect Android emulator serial (finds first running emulator)
qa_detect_android_serial() {
if [ "$ANDROID_SERIAL" != "auto" ]; then
echo "$ANDROID_SERIAL"
return 0
fi
local adb_bin="$ADB_PATH"
if [ ! -x "$adb_bin" ]; then
adb_bin=$(command -v adb 2>/dev/null || echo "")
fi
if [ -z "$adb_bin" ]; then
echo ""
return 1
fi
local serial
serial=$("$adb_bin" devices 2>/dev/null | awk '$2 == "device" && $1 ~ /^emulator-/ { print $1; exit }' || echo "")
if [ -n "$serial" ]; then
export ANDROID_SERIAL="$serial"
echo "$serial"
return 0
fi
echo ""
return 1
}
# Auto-detect CDP WebSocket URL from Metro /json endpoint
qa_detect_cdp_ws_url() {
    if [ "$CDP_WS_URL" != "auto" ]; then
        echo "$CDP_WS_URL"
        return 0
    fi

    local json
    json=$(curl -s "$CDP_DISCOVERY_URL" 2>/dev/null || echo "[]")

    local ws_url
    ws_url=$(echo "$json" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
            try {
                const targets=JSON.parse(d);
                // Prefer 'Bridgeless' target (Hermes), fall back to first
                const hermes=targets.find(t=>t.description && t.description.includes('Bridgeless'));
                console.log(hermes ? hermes.webSocketDebuggerUrl : (targets[0]?.webSocketDebuggerUrl || ''));
            } catch(e) { console.log(''); }
        });
    " 2>/dev/null || echo "")

    if [ -n "$ws_url" ]; then
        export CDP_WS_URL="$ws_url"
        echo "$ws_url"
        return 0
    fi

    echo ""
    return 1
}

# Auto-detect and cache the React Navigation module ID
qa_detect_nav_module() {
    # Check cache first
    if [ -f "$NAV_MODULE_CACHE" ]; then
        local cached
        cached=$(cat "$NAV_MODULE_CACHE" 2>/dev/null || echo "")
        if [ -n "$cached" ]; then
            echo "$cached"
            return 0
        fi
    fi

    local ws_url
    ws_url=$(qa_detect_cdp_ws_url)
    if [ -z "$ws_url" ]; then
        echo ""
        return 1
    fi

    local module_id
    module_id=$(cd "$PROJECT_DIR" && node -e "
        const WebSocket=require('ws');
        const ws=new WebSocket('$ws_url');
        ws.on('open',()=>{
            const expr=\`
                (function(){
                    var origHandler=globalThis.ErrorUtils?ErrorUtils.getGlobalHandler():null;
                    var origCE=console.error;
                    if(globalThis.ErrorUtils)ErrorUtils.setGlobalHandler(function(){});
                    console.error=function(){};
                    try{
                        for(var j=${MODULE_SCAN_START};j<${MODULE_SCAN_END};j++){
                            try{
                                var m=__r(j);
                                if(m&&m.navigationRef&&m.navigationRef.current){
                                    return JSON.stringify({ok:true,moduleId:j});
                                }
                            }catch(e){}
                        }
                        return JSON.stringify({error:'not found'});
                    }finally{
                        if(globalThis.ErrorUtils&&origHandler)ErrorUtils.setGlobalHandler(origHandler);
                        console.error=origCE;
                    }
                })();
            \`;
            ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true}}));
        });
        ws.on('message',d=>{
            const m=JSON.parse(d);
            if(m.id===1){console.log(m.result?.result?.value||'');ws.close();process.exit(0);}
        });
        ws.on('error',()=>{console.log('');process.exit(1)});
        setTimeout(()=>{console.log('');process.exit(1)},10000);
    " 2>/dev/null || echo "")

    local id
    id=$(echo "$module_id" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{try{const o=JSON.parse(d);console.log(o.moduleId||'')}catch(e){console.log('')}});
    " 2>/dev/null || echo "")

    if [ -n "$id" ]; then
        echo "$id" > "$NAV_MODULE_CACHE"
        echo "$id"
        return 0
    fi

    echo ""
    return 1
}

# ── Source local overrides (if present) ──────────────────────────────
if [ -f "$QA_AUTOMATION_DIR/qa.config.local.sh" ]; then
    source "$QA_AUTOMATION_DIR/qa.config.local.sh"
fi

# ── Ensure output directories exist ─────────────────────────────────
mkdir -p "$TEST_OUTPUT_DIR" "$SCREENSHOT_DIR" 2>/dev/null || true
