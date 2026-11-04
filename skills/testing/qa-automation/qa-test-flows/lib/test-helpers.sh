#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  test-helpers.sh — Core Test Framework for QA Automation          ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  Source this file at the top of every test flow script:           ║
# ║    source "$(dirname "$0")/../../lib/test-helpers.sh"             ║
# ║                                                                   ║
# ║  Provides:                                                        ║
# ║    • Test lifecycle (setup_test, teardown_test, step)             ║
# ║    • Logging (log_pass, log_fail, log_info, log_warn)            ║
# ║    • agent-device wrappers (tap, swipe, scroll, screenshot)      ║
# ║    • Assertion functions (assert_app_foreground, etc.)            ║
# ║    • Navigation helpers (tap_tab, launch_app, close_app)         ║
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Source configuration ─────────────────────────────────────────────
HELPERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QA_ROOT="$(cd "$HELPERS_DIR/../.." && pwd)"
source "$QA_ROOT/qa.config.sh"

# ── Auto-detect active native device if set to "auto" ───────────────
if qa_is_ios && [ "$SIMULATOR_UDID" = "auto" ]; then
    _detected_udid=$(qa_detect_simulator_udid 2>/dev/null || echo "")
    if [ -n "$_detected_udid" ]; then
        SIMULATOR_UDID="$_detected_udid"
        export SIMULATOR_UDID
    fi
elif qa_is_android && [ "$ANDROID_SERIAL" = "auto" ]; then
    _detected_serial=$(qa_detect_android_serial 2>/dev/null || echo "")
    if [ -n "$_detected_serial" ]; then
        ANDROID_SERIAL="$_detected_serial"
        export ANDROID_SERIAL
    fi
fi

qa_adb_cmd() {
    local adb_bin="$ADB_PATH"
    if [ ! -x "$adb_bin" ]; then
        adb_bin=$(command -v adb 2>/dev/null || echo "")
    fi
    if [ -z "$adb_bin" ]; then
        return 1
    fi
    "$adb_bin" "$@"
}

# ── Test State ───────────────────────────────────────────────────────
TEST_NAME=""
STEP_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0
TEST_START_TIME=""

# ── Initialization ───────────────────────────────────────────────────

init_test_env() {
    mkdir -p "$TEST_OUTPUT_DIR"
    mkdir -p "$SCREENSHOT_DIR"
    if [ ! -f "$RESULTS_FILE" ]; then
        echo "Test Run: $(date '+%Y-%m-%d %H:%M:%S')" > "$RESULTS_FILE"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$RESULTS_FILE"
    fi
}

init_test_env

# ── Test Lifecycle ───────────────────────────────────────────────────

setup_test() {
    local name="$1"
    TEST_NAME="$name"
    TEST_START_TIME=$(date +%s)
    STEP_COUNT=0
    PASS_COUNT=0
    FAIL_COUNT=0
    mkdir -p "$SCREENSHOT_DIR/$TEST_NAME"
    echo ""
    echo "═══════════════════════════════════════════"
    echo "🧪 TEST: $TEST_NAME"
    echo "═══════════════════════════════════════════"
    echo "Started: $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
}

teardown_test() {
    local name="${1:-$TEST_NAME}"
    local end_time=$(date +%s)
    local duration=$((end_time - TEST_START_TIME))
    echo ""
    echo "───────────────────────────────────────────"
    echo "📊 RESULTS: $name"
    echo "   Steps: $STEP_COUNT | Passed: $PASS_COUNT | Failed: $FAIL_COUNT"
    echo "   Duration: ${duration}s"
    if [ $FAIL_COUNT -eq 0 ]; then
        echo "   Status: ✅ ALL PASSED"
    else
        echo "   Status: ❌ $FAIL_COUNT FAILURES"
    fi
    echo "───────────────────────────────────────────"
    echo ""
    echo "$(date '+%Y-%m-%d %H:%M:%S') | $name | Steps:$STEP_COUNT Pass:$PASS_COUNT Fail:$FAIL_COUNT | ${duration}s" >> "$RESULTS_FILE"
}

# ── Logging ──────────────────────────────────────────────────────────

step() {
    STEP_COUNT=$((STEP_COUNT + 1))
    echo "  [$STEP_COUNT] $1"
}

log_pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "       ✅ $1"
}

log_fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "       ❌ $1"
}

log_info() {
    echo "       ℹ️  $1"
}

log_warn() {
    echo "       ⚠️  $1"
}

# ── agent-device Wrappers ────────────────────────────────────────────

# Take a screenshot using the active platform-native tool where possible.
# Falls back to agent-device if the native tool is unavailable.
# Usage: take_screenshot "step_name" [session]
take_screenshot() {
    local name="$1"
    local session="${2:-$ACTIVE_SESSION}"
    local path="$SCREENSHOT_DIR/$TEST_NAME/${name}.png"
    mkdir -p "$(dirname "$path")"

    if qa_is_android && [ "${ANDROID_SERIAL:-auto}" != "auto" ]; then
        qa_adb_cmd -s "$ANDROID_SERIAL" exec-out screencap -p > "$path" 2>/dev/null || {
            agent-device screenshot "$path" --session "$session" 2>/dev/null || {
                log_warn "Screenshot failed for: $name"
                return 1
            }
        }
    elif qa_is_ios && [ "$SIMULATOR_UDID" != "auto" ] && command -v xcrun >/dev/null 2>&1; then
        xcrun simctl io "$SIMULATOR_UDID" screenshot "$path" 2>/dev/null || {
            agent-device screenshot "$path" --session "$session" 2>/dev/null || {
                log_warn "Screenshot failed for: $name"
                return 1
            }
        }
    else
        agent-device screenshot "$path" --session "$session" 2>/dev/null || {
            log_warn "Screenshot failed for: $name"
            return 1
        }
    fi
    echo "$path"
}

# Tap at coordinates with timeout handling
# Usage: tap x y [session]
tap() {
    local x="$1"
    local y="$2"
    local session="${3:-$ACTIVE_SESSION}"

    agent-device click "$x" "$y" --session "$session" 2>/dev/null &
    local pid=$!

    sleep 0.5
    if ps -p $pid > /dev/null 2>&1; then
        kill $pid 2>/dev/null || true
        wait $pid 2>/dev/null || true
    fi

    sleep 1
}

# Swipe gesture
# Usage: swipe x1 y1 x2 y2 [session]
swipe() {
    local x1="$1"
    local y1="$2"
    local x2="$3"
    local y2="$4"
    local session="${5:-$ACTIVE_SESSION}"

    agent-device swipe "$x1" "$y1" "$x2" "$y2" --session "$session" 2>/dev/null &
    local pid=$!

    sleep 0.5
    if ps -p $pid > /dev/null 2>&1; then
        kill $pid 2>/dev/null || true
        wait $pid 2>/dev/null || true
    fi

    sleep 1
}

# Scroll in a direction
# Usage: scroll_dir direction [session]
scroll_dir() {
    local direction="$1"
    local session="${2:-$ACTIVE_SESSION}"

    agent-device scroll "$direction" --session "$session" 2>/dev/null &
    local pid=$!

    sleep 0.5
    if ps -p $pid > /dev/null 2>&1; then
        kill $pid 2>/dev/null || true
        wait $pid 2>/dev/null || true
    fi

    sleep 1
}

# Type text into focused field
# Usage: type_text ref_or_coords text [session]
type_text() {
    local ref="$1"
    local text="$2"
    local session="${3:-$ACTIVE_SESSION}"

    agent-device fill "$ref" "$text" --session "$session" 2>/dev/null &
    local pid=$!

    sleep 0.5
    if ps -p $pid > /dev/null 2>&1; then
        kill $pid 2>/dev/null || true
        wait $pid 2>/dev/null || true
    fi

    sleep 1
}

# Press home button
go_home() {
    local session="${1:-$ACTIVE_SESSION}"
    agent-device home --session "$session" 2>/dev/null &
    local pid=$!
    sleep 1
    if ps -p $pid > /dev/null 2>&1; then
        kill $pid 2>/dev/null || true
        wait $pid 2>/dev/null || true
    fi
    sleep 2
}

# Go back
go_back() {
    local session="${1:-$ACTIVE_SESSION}"
    agent-device back --session "$session" 2>/dev/null &
    local pid=$!
    sleep 1
    if ps -p $pid > /dev/null 2>&1; then
        kill $pid 2>/dev/null || true
        wait $pid 2>/dev/null || true
    fi
    sleep 2
}

# Check if the app process is running on the active native device
check_appstate() {
local session="${1:-$ACTIVE_SESSION}"
if qa_is_android && [ "${ANDROID_SERIAL:-auto}" != "auto" ]; then
if qa_adb_cmd -s "$ANDROID_SERIAL" shell pidof "$APP_BUNDLE_ID" >/dev/null 2>&1; then
echo "$APP_BUNDLE_ID"
else
echo ""
fi
elif qa_is_ios && [ "$SIMULATOR_UDID" != "auto" ] && command -v xcrun >/dev/null 2>&1; then
xcrun simctl spawn "$SIMULATOR_UDID" launchctl list 2>/dev/null | grep "UIKitApplication:${APP_BUNDLE_ID}" || echo ""
else
agent-device appstate --session "$session" 2>/dev/null || echo ""
fi
}
# Get accessibility snapshot
get_snapshot() {
    local session="${1:-$ACTIVE_SESSION}"
    local depth="${2:-5}"
    timeout 10 agent-device snapshot -i --depth "$depth" --session "$session" 2>/dev/null || echo "(snapshot timeout)"
}

# ── Assertion Functions ──────────────────────────────────────────────

# Assert app is in foreground
assert_app_foreground() {
    local session="${1:-$ACTIVE_SESSION}"
    local state=$(check_appstate "$session" 2>/dev/null | grep -o "$APP_BUNDLE_ID" || true)

    if [ -n "$state" ]; then
        log_pass "App is in foreground ($APP_BUNDLE_ID)"
        return 0
    else
        log_fail "App is NOT in foreground"
        return 1
    fi
}

# Assert screenshot was captured
assert_screenshot() {
    local name="$1"
    local path="$SCREENSHOT_DIR/$TEST_NAME/${name}.png"

    if [ -f "$path" ] && [ -s "$path" ]; then
        log_pass "Screenshot captured: $name"
        return 0
    else
        log_fail "Screenshot missing or empty: $name"
        return 1
    fi
}

# Assert text is visible in accessibility tree
assert_text_visible() {
    local text="$1"
    local session="${2:-$ACTIVE_SESSION}"
    local snapshot=$(get_snapshot "$session")

    if echo "$snapshot" | grep -qi "$text"; then
        log_pass "Text visible: '$text'"
        return 0
    else
        log_warn "Text not found in accessibility tree: '$text'"
        return 1
    fi
}

# Assert element exists in accessibility tree
assert_element_exists() {
    local label="$1"
    local session="${2:-$ACTIVE_SESSION}"
    local snapshot=$(get_snapshot "$session")

    if echo "$snapshot" | grep -qi "label.*$label\|name.*$label"; then
        log_pass "Element found: '$label'"
        return 0
    else
        log_fail "Element not found: '$label'"
        return 1
    fi
}

# ── Navigation Helpers ───────────────────────────────────────────────

# Tap a tab by position (1-5)
# Usage: tap_tab 1  (first tab)
tap_tab_by_index() {
    local index="$1"
    local x_var="TAB_${index}_X"
    local x="${!x_var:-}"

    if [ -z "$x" ]; then
        log_fail "No coordinate defined for tab index $index (set TAB_${index}_X)"
        return 1
    fi

    tap "$x" "$TAB_BAR_Y"
    sleep 2
}

# Tap a tab by name (reads screen names from config and maps to tab index)
# Usage: tap_tab "explore"
tap_tab() {
    local tab_name="$1"
    local tab_name_upper=$(echo "$tab_name" | tr '[:lower:]' '[:upper:]')

    # Map common names to tab indices — customize in qa.config.sh
    case "$tab_name_upper" in
        EXPLORE|HOME|TAB1|1) tap_tab_by_index 1 ;;
        SEARCH|TAB2|2)       tap_tab_by_index 2 ;;
        CREATE|TAB3|3)       tap_tab_by_index 3 ;;
        WALLET|TAB4|4)       tap_tab_by_index 4 ;;
        PROFILE|TAB5|5)      tap_tab_by_index 5 ;;
        *)
            log_fail "Unknown tab: $tab_name"
            return 1
            ;;
    esac
}

# Launch the app fresh
launch_app() {
local session="${1:-$ACTIVE_SESSION}"
step "Launching app ($APP_BUNDLE_ID) on ${QA_PLATFORM:-ios}"
if qa_is_android && [ "${ANDROID_SERIAL:-auto}" != "auto" ]; then
qa_adb_cmd -s "$ANDROID_SERIAL" shell am force-stop "$APP_BUNDLE_ID" 2>/dev/null || true
sleep 1
qa_adb_cmd -s "$ANDROID_SERIAL" shell monkey -p "$APP_BUNDLE_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || {
log_fail "Failed to launch Android app via adb"
return 1
}
elif qa_is_ios && [ "$SIMULATOR_UDID" != "auto" ] && command -v xcrun >/dev/null 2>&1; then
xcrun simctl terminate "$SIMULATOR_UDID" "$APP_BUNDLE_ID" 2>/dev/null || true
sleep 1
xcrun simctl launch "$SIMULATOR_UDID" "$APP_BUNDLE_ID" 2>/dev/null || {
log_fail "Failed to launch iOS app via xcrun"
return 1
}
else
agent-device open "$APP_BUNDLE_ID" --session "$session" --relaunch 2>/dev/null || {
log_fail "Failed to launch app"
return 1
}
fi
sleep "$APP_SETTLE_TIME"
log_pass "App launched on ${QA_PLATFORM:-ios}"
}
# Close the app
close_app() {
local session="${1:-$ACTIVE_SESSION}"
if qa_is_android && [ "${ANDROID_SERIAL:-auto}" != "auto" ]; then
qa_adb_cmd -s "$ANDROID_SERIAL" shell am force-stop "$APP_BUNDLE_ID" 2>/dev/null || {
log_warn "Could not terminate Android app via adb"
return 1
}
elif qa_is_ios && [ "$SIMULATOR_UDID" != "auto" ] && command -v xcrun >/dev/null 2>&1; then
xcrun simctl terminate "$SIMULATOR_UDID" "$APP_BUNDLE_ID" 2>/dev/null || {
log_warn "Could not terminate iOS app via xcrun"
return 1
}
else
agent-device close --session "$session" 2>/dev/null || {
log_warn "Could not close app"
return 1
}
fi
sleep 2
}
# Wait for app to settle
wait_settle() {
    local seconds="${1:-3}"
    sleep "$seconds"
}

# ── Utility Functions ────────────────────────────────────────────────

# Print test summary
print_test_summary() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 TEST EXECUTION SUMMARY"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    tail -20 "$RESULTS_FILE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

log_debug() {
    local msg="$1"
    echo "[DEBUG] $(date '+%H:%M:%S') $msg" >> "$RESULTS_FILE"
}

save_snapshot() {
    local desc="$1"
    local session="${2:-$ACTIVE_SESSION}"
    local filename="$(echo "$desc" | tr ' ' '_' | tr -cd '[:alnum:]._-')"
    local snap=$(get_snapshot "$session")
    echo "$snap" > "$SCREENSHOT_DIR/$TEST_NAME/${filename}_snapshot.txt"
    log_info "Saved snapshot: $filename"
}

# ── Error Handling ───────────────────────────────────────────────────

trap 'teardown_test 2>/dev/null || true' EXIT

on_error() {
    local line=$1
    log_fail "Error on line $line"
    log_debug "Exit code: $?"
}

trap 'on_error ${LINENO}' ERR

# ── Export Functions ─────────────────────────────────────────────────

export -f setup_test teardown_test step log_pass log_fail log_info log_warn 2>/dev/null || true
export -f take_screenshot tap swipe scroll_dir type_text 2>/dev/null || true
export -f go_home go_back check_appstate get_snapshot 2>/dev/null || true
export -f assert_app_foreground assert_screenshot assert_text_visible assert_element_exists 2>/dev/null || true
export -f tap_tab tap_tab_by_index launch_app close_app wait_settle 2>/dev/null || true
export -f print_test_summary log_debug save_snapshot 2>/dev/null || true

echo "Test helpers loaded. Platform: $QA_PLATFORM | Session: $ACTIVE_SESSION | App: $APP_BUNDLE_ID"
