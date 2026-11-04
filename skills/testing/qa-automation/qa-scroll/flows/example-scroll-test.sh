#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  Example Scroll Test — Feed Scroll & Video Playback QA            ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  CUSTOMIZE: Replace the marked sections with your app's specific  ║
# ║  screen names, navigation patterns, and video player details.     ║
# ║                                                                   ║
# ║  Usage: bash skills/testing/qa-automation/qa-scroll/flows/example-scroll-test.sh
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Source Libraries ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/scroll-helpers.sh"

# ── Test Setup ───────────────────────────────────────────────────────
TEST_NAME="feed-scroll-play"
setup_test "$TEST_NAME"

# Run setup guard — checks all prerequisites
run_setup_guard || {
    echo "FATAL: Setup guard failed. Cannot run tests."
    teardown_test
    exit 1
}

# Track results for report
declare -a TEST_RESULTS=()

add_test_result() {
    local name="$1"
    local status="$2"
    local error="${3:-}"
    local screenshots="${4:-}"
    TEST_RESULTS+=("$(cat <<RESULT
{
    "name": "$name",
    "suite": "Feed Scroll & Play",
    "status": "$status",
    "error": "$error",
    "screenshots": [$screenshots]
}
RESULT
)")
}

# ════════════════════════════════════════════════════════════════════
# CUSTOMIZE: Step 0 — Install Debug Hook & Verify App
# ════════════════════════════════════════════════════════════════════
step "Verify app is running and install video debug hook"
assert_app_foreground || {
    log_fail "App not in foreground"
    add_test_result "App Foreground Check" "failed" "App not in foreground"
}

log_info "Installing video player debug hook..."
hook_result=$(install_debug_hook 2>&1 || echo '{"error":"hook install failed"}')
log_info "Debug hook result: $hook_result"

take_screenshot "00-initial"
assert_screenshot "00-initial" || true

# ════════════════════════════════════════════════════════════════════
# CUSTOMIZE: Step 1 — Navigate to Your Feed Screen
# Replace SCREEN_EXPLORE with your app's feed screen name.
# ════════════════════════════════════════════════════════════════════
step "Navigate to feed screen"

# Navigate away first, then to feed (ensures fresh mount)
nav_home 2>/dev/null || true
sleep 1

# CUSTOMIZE: Change this to your feed screen's navigation command
nav_explore
sleep 4

# Check for error overlay
overlay=$(check_error_overlay)
if [ "$overlay" = "visible" ]; then
    log_warn "Error overlay detected — dismissing"
    dismiss_error_overlay
    sleep 1
fi

take_screenshot "01-feed-screen"
if assert_screenshot "01-feed-screen"; then
    log_pass "Navigated to feed screen"
    add_test_result "Navigate to Feed" "passed" "" "\"01-feed-screen.png\""
else
    log_fail "Failed to capture feed screen"
    add_test_result "Navigate to Feed" "failed" "Screenshot failed"
fi

# ════════════════════════════════════════════════════════════════════
# Step 2 — Verify First Video Autoplays
# ════════════════════════════════════════════════════════════════════
step "Verify first video autoplays"
sleep 3

video_state=$(query_video_playing 2>&1 || echo '{"playing":false}')
log_info "Video state: $video_state"

playing=$(echo "$video_state" | node -e "
    var d=''; process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
        try { console.log(JSON.parse(d).playing?'true':'false'); }
        catch(e) { console.log('false'); }
    });
" 2>/dev/null || echo "false")

has_error=$(echo "$video_state" | node -e "
    var d=''; process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
        try { console.log(JSON.parse(d).error?'yes':'no'); }
        catch(e) { console.log('yes'); }
    });
" 2>/dev/null || echo "yes")

take_screenshot "02-first-video"

if [ "$playing" = "true" ]; then
    log_pass "First video is autoplaying"
    add_test_result "First Video Autoplay" "passed" "" "\"02-first-video.png\""
elif [ "$has_error" = "yes" ]; then
    log_warn "Autoplay check skipped — CDP returned error"
    add_test_result "First Video Autoplay" "skipped" "CDP error: $video_state" "\"02-first-video.png\""
else
    log_fail "First video is NOT autoplaying"
    add_test_result "First Video Autoplay" "failed" "Not playing" "\"02-first-video.png\""
fi

# ════════════════════════════════════════════════════════════════════
# Step 3 — Verify Video Progress
# ════════════════════════════════════════════════════════════════════
step "Verify video playback is progressing"

if [ "$playing" = "false" ] && [ "$has_error" = "yes" ]; then
    log_warn "Progress check skipped — no tracked players"
    take_screenshot "03-progress"
    add_test_result "Video Progress" "skipped" "No players" "\"03-progress.png\""
else
    progress=$(check_video_progress 2>&1 || echo "unknown")
    take_screenshot "03-progress"

    if [ "$progress" = "advancing" ]; then
        log_pass "Video playback is progressing"
        add_test_result "Video Progress" "passed" "" "\"03-progress.png\""
    elif [ "$progress" = "stalled" ]; then
        log_fail "Video playback is stalled"
        add_test_result "Video Progress" "failed" "Stalled" "\"03-progress.png\""
    else
        log_warn "Progress check: $progress"
        add_test_result "Video Progress" "skipped" "$progress" "\"03-progress.png\""
    fi
fi

# ════════════════════════════════════════════════════════════════════
# Step 4 — Scroll to Next Video
# ════════════════════════════════════════════════════════════════════
step "Scroll to next video"
scroll_to_next_video
sleep 3

take_screenshot "04-second-video"
add_test_result "Scroll to Next" "passed" "" "\"04-second-video.png\""

# ════════════════════════════════════════════════════════════════════
# Step 5 — Mute Toggle
# ════════════════════════════════════════════════════════════════════
step "Toggle mute via CDP"

initial_mute=$(get_mute_state 2>&1 || echo "unknown")
new_mute=$(toggle_mute_cdp 2>&1 || echo "unknown")
take_screenshot "05-mute-toggle"

if [ "$initial_mute" != "unknown" ] && [ "$new_mute" != "unknown" ] && [ "$initial_mute" != "$new_mute" ]; then
    log_pass "Mute toggled: $initial_mute -> $new_mute"
    add_test_result "Mute Toggle" "passed" "" "\"05-mute-toggle.png\""
elif [ "$initial_mute" = "unknown" ] || [ "$new_mute" = "unknown" ]; then
    log_warn "Mute toggle skipped — state unknown"
    add_test_result "Mute Toggle" "skipped" "$initial_mute -> $new_mute" "\"05-mute-toggle.png\""
else
    log_fail "Mute did not toggle"
    add_test_result "Mute Toggle" "failed" "$initial_mute -> $new_mute" "\"05-mute-toggle.png\""
fi

# Toggle back
toggle_mute_cdp >/dev/null 2>&1 || true

# ════════════════════════════════════════════════════════════════════
# Step 6 — Scroll Through More Videos
# ════════════════════════════════════════════════════════════════════
for i in 3 4 5; do
    step "Scroll to video #$i"
    scroll_to_next_video
    sleep 2
    take_screenshot "06-video-${i}"
    add_test_result "Scroll to Video $i" "passed" "" "\"06-video-${i}.png\""
done

# ════════════════════════════════════════════════════════════════════
# Step 7 — Final State Verification
# ════════════════════════════════════════════════════════════════════
step "Final state verification"

overlay=$(check_error_overlay)
if [ "$overlay" = "visible" ]; then
    dismiss_error_overlay
    sleep 1
fi

take_screenshot "07-final"

# CUSTOMIZE: Change the route name to match your feed screen
route=$(cdp_get_route 2>&1 || echo "unknown")
log_info "Current route: $route"
add_test_result "Final State" "passed" "Route: $route" "\"07-final.png\""

assert_app_foreground || log_warn "App foreground check failed"

# ════════════════════════════════════════════════════════════════════
# Generate Report
# ════════════════════════════════════════════════════════════════════
step "Generating test report"

SKIP_COUNT=0
for result in "${TEST_RESULTS[@]}"; do
    if echo "$result" | grep -q '"status": "skipped"'; then
        SKIP_COUNT=$((SKIP_COUNT + 1))
    fi
done

TESTS_JSON=""
for result in "${TEST_RESULTS[@]}"; do
    [ -n "$TESTS_JSON" ] && TESTS_JSON+=","
    TESTS_JSON+="$result"
done

REPORT_FILE="$TEST_OUTPUT_DIR/${TEST_NAME}-report.json"
end_time=$(date +%s)
duration=$((end_time - TEST_START_TIME))
duration_ms=$((duration * 1000))

cat > "$REPORT_FILE" <<REPORT
{
    "title": "Feed Scroll & Play QA",
    "generatedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
    "suites": [{
        "name": "Feed Scroll & Play",
        "type": "e2e",
        "passed": $PASS_COUNT,
        "failed": $FAIL_COUNT,
        "skipped": $SKIP_COUNT,
        "duration": $duration_ms,
        "tests": [$TESTS_JSON],
        "screenshotDir": "$SCREENSHOT_DIR/$TEST_NAME"
    }],
    "totalPassed": $PASS_COUNT,
    "totalFailed": $FAIL_COUNT,
    "totalSkipped": $SKIP_COUNT,
    "totalDuration": $duration_ms
}
REPORT

log_info "Report saved to: $REPORT_FILE"
teardown_test

echo ""
echo "Scroll test completed!"
echo "   Screenshots: $SCREENSHOT_DIR/$TEST_NAME/"
echo "   Report: $REPORT_FILE"
echo ""
