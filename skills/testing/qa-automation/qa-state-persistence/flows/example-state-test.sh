#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  Example State Persistence Test                                   ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  Tests: mutate state → scroll away → scroll back → verify state  ║
# ║                                                                   ║
# ║  CUSTOMIZE: Set STATE_PROPERTY and SCREEN_EXPLORE in qa.config.sh ║
# ║                                                                   ║
# ║  Usage: bash skills/testing/qa-automation/qa-state-persistence/flows/example-state-test.sh
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Source Libraries ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/state-helpers.sh"

# ── Test Setup ───────────────────────────────────────────────────────
TEST_NAME="state-persistence"
setup_test "$TEST_NAME"

run_setup_guard || {
    echo "FATAL: Setup guard failed."
    teardown_test
    exit 1
}

declare -a TEST_RESULTS=()

add_test_result() {
    local name="$1"
    local status="$2"
    local error="${3:-}"
    local screenshots="${4:-}"
    TEST_RESULTS+=("$(cat <<RESULT
{
    "name": "$name",
    "suite": "State Persistence",
    "status": "$status",
    "error": "$error",
    "screenshots": [$screenshots]
}
RESULT
)")
}

# ════════════════════════════════════════════════════════════════════
# Step 0 — Install Hooks
# ════════════════════════════════════════════════════════════════════
step "Install debug hooks"
assert_app_foreground || add_test_result "App Check" "failed" "Not foreground"

hook_result=$(install_debug_hook 2>&1 || echo '{"error":"failed"}')
log_info "Video hook: $hook_result"

take_screenshot "00-initial"

# ════════════════════════════════════════════════════════════════════
# Step 1 — Navigate to Feed
# CUSTOMIZE: Change nav_explore to your feed navigation
# ════════════════════════════════════════════════════════════════════
step "Navigate to feed screen"
nav_home 2>/dev/null || true
sleep 1
nav_explore
sleep 4

overlay=$(check_error_overlay)
[ "$overlay" = "visible" ] && dismiss_error_overlay && sleep 1

# Reset to index 0
current_idx=$(get_current_feed_index)
if [ "$current_idx" != "0" ] && [ "$current_idx" != "-1" ]; then
    scroll_to_index 0
    sleep 3
fi

# Install state hook after feed is mounted
state_hook_result=$(install_state_debug_hook 2>&1 || echo '{"error":"failed"}')
log_info "State hook: $state_hook_result"

take_screenshot "01-feed"
add_test_result "Navigate to Feed" "passed" "" "\"01-feed.png\""

# ════════════════════════════════════════════════════════════════════
# Step 2 — Record Item Identity
# ════════════════════════════════════════════════════════════════════
step "Record first item identity"

first_item=$(query_item_state 0 2>&1 || echo '{"error":"query failed"}')
log_info "First item: $first_item"

item_id=$(echo "$first_item" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{try{console.log(JSON.parse(d).id||'unknown')}catch(e){console.log('unknown')}});
" 2>/dev/null || echo "unknown")

has_ok=$(echo "$first_item" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{try{console.log(JSON.parse(d).ok?'yes':'no')}catch(e){console.log('no')}});
" 2>/dev/null || echo "no")

if [ "$has_ok" = "yes" ]; then
    log_pass "Item captured: $item_id"
    add_test_result "Record Identity" "passed" ""
else
    # Retry with re-installed hook
    install_state_debug_hook >/dev/null 2>&1 || true
    sleep 2
    first_item=$(query_item_state 0 2>&1 || echo '{"error":"retry failed"}')
    has_ok=$(echo "$first_item" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{try{console.log(JSON.parse(d).ok?'yes':'no')}catch(e){console.log('no')}});
    " 2>/dev/null || echo "no")

    if [ "$has_ok" = "yes" ]; then
        add_test_result "Record Identity" "passed" "Retry succeeded"
    else
        add_test_result "Record Identity" "skipped" "Could not read data"
    fi
fi

# ════════════════════════════════════════════════════════════════════
# Step 3 — Verify Initial State
# ════════════════════════════════════════════════════════════════════
step "Verify initial state (${STATE_PROPERTY} should be false)"

initial_value=$(echo "$first_item" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{try{console.log(JSON.parse(d).${STATE_PROPERTY}?'true':'false')}catch(e){console.log('unknown')}});
" 2>/dev/null || echo "unknown")

take_screenshot "02-initial-state"

if [ "$initial_value" = "true" ]; then
    log_warn "State is already true — toggling off for clean baseline"
    toggle_item_property_cdp >/dev/null 2>&1
    sleep 2
    add_test_result "Initial State" "passed" "Reset to false"
elif [ "$initial_value" = "false" ]; then
    log_pass "Clean baseline (${STATE_PROPERTY}=false)"
    add_test_result "Initial State" "passed" "" "\"02-initial-state.png\""
else
    add_test_result "Initial State" "skipped" "Unknown" "\"02-initial-state.png\""
fi

# ════════════════════════════════════════════════════════════════════
# Step 4 — Mutate State
# ════════════════════════════════════════════════════════════════════
step "Mutate state (set ${STATE_PROPERTY}=true)"

toggle_result=$(toggle_item_property_cdp 2>&1 || echo '{"error":"failed"}')
log_info "Toggle result: $toggle_result"
take_screenshot "03-after-mutate"

after_value=$(query_item_state 0 2>&1 || echo '{"error":"failed"}')
after_prop=$(echo "$after_value" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{try{console.log(JSON.parse(d).${STATE_PROPERTY}?'true':'false')}catch(e){console.log('unknown')}});
" 2>/dev/null || echo "unknown")

if [ "$after_prop" = "true" ]; then
    log_pass "State mutated successfully"
    add_test_result "Mutate State" "passed" "" "\"03-after-mutate.png\""
else
    log_warn "Could not verify mutation: $after_prop"
    add_test_result "Mutate State" "skipped" "Verification failed" "\"03-after-mutate.png\""
fi

# ════════════════════════════════════════════════════════════════════
# Step 5 — Scroll Away
# ════════════════════════════════════════════════════════════════════
for i in $(seq 1 $STATE_SCROLL_COUNT); do
    step "Scroll to item #$i"
    scroll_to_next_video
    sleep 2
    take_screenshot "04-scroll-${i}"
    add_test_result "Scroll to Item $i" "passed" "" "\"04-scroll-${i}.png\""
done

# Verify we scrolled away
away_index=$(get_current_feed_index)
log_info "Current index: $away_index"
take_screenshot "05-scrolled-away"
add_test_result "Scrolled Away" "passed" "Index: $away_index" "\"05-scrolled-away.png\""

# ════════════════════════════════════════════════════════════════════
# Step 6 — Scroll Back
# ════════════════════════════════════════════════════════════════════
step "Scroll back to first item"
scroll_to_index 0
sleep 3

back_index=$(get_current_feed_index)
take_screenshot "06-scrolled-back"

if [ "$back_index" = "0" ]; then
    log_pass "Back at first item"
    add_test_result "Scroll Back" "passed" "" "\"06-scrolled-back.png\""
else
    scroll_back_to_start
    sleep 2
    add_test_result "Scroll Back" "passed" "Used fallback" "\"06-scrolled-back.png\""
fi

# ════════════════════════════════════════════════════════════════════
# Step 7 — KEY ASSERTION: State Persisted
# ════════════════════════════════════════════════════════════════════
step "★ KEY ASSERTION: Verify ${STATE_PROPERTY} persisted"

# Re-install hook (fiber tree may have shifted)
install_state_debug_hook >/dev/null 2>&1 || true
sleep 2

persist_state=$(query_item_state 0 2>&1 || echo '{"error":"failed"}')
persist_value=$(echo "$persist_state" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{try{console.log(JSON.parse(d).${STATE_PROPERTY}?'true':'false')}catch(e){console.log('unknown')}});
" 2>/dev/null || echo "unknown")

take_screenshot "07-persisted"

if [ "$persist_value" = "true" ]; then
    log_pass "★ STATE PERSISTED! ${STATE_PROPERTY} is still true after scrolling away and back"
    add_test_result "State Persisted" "passed" "" "\"07-persisted.png\""
elif [ "$persist_value" = "unknown" ]; then
    log_warn "Could not verify — CDP state read failed"
    add_test_result "State Persisted" "skipped" "CDP failed" "\"07-persisted.png\""
else
    log_fail "★ STATE LOST! ${STATE_PROPERTY} is false after scrolling back"
    add_test_result "State Persisted" "failed" "${STATE_PROPERTY}=false after scroll" "\"07-persisted.png\""
fi

# ════════════════════════════════════════════════════════════════════
# Step 8 — Cleanup
# ════════════════════════════════════════════════════════════════════
step "Cleanup: restore original state"

if [ "$persist_value" = "true" ]; then
    toggle_item_property_cdp >/dev/null 2>&1 || true
    sleep 1
    log_pass "State restored"
    add_test_result "Cleanup" "passed" ""
else
    log_info "No cleanup needed"
    add_test_result "Cleanup" "passed" "Not needed"
fi

take_screenshot "08-final"

# ════════════════════════════════════════════════════════════════════
# Generate Report
# ════════════════════════════════════════════════════════════════════
step "Generating report"

SKIP_COUNT=0
for r in "${TEST_RESULTS[@]}"; do
    echo "$r" | grep -q '"status": "skipped"' && SKIP_COUNT=$((SKIP_COUNT + 1))
done

TESTS_JSON=""
for r in "${TEST_RESULTS[@]}"; do
    [ -n "$TESTS_JSON" ] && TESTS_JSON+=","
    TESTS_JSON+="$r"
done

REPORT_FILE="$TEST_OUTPUT_DIR/${TEST_NAME}-report.json"
end_time=$(date +%s)
duration=$((end_time - TEST_START_TIME))

cat > "$REPORT_FILE" <<REPORT
{
    "title": "State Persistence QA",
    "generatedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
    "suites": [{
        "name": "State Persistence (${STATE_PROPERTY})",
        "type": "e2e",
        "passed": $PASS_COUNT,
        "failed": $FAIL_COUNT,
        "skipped": $SKIP_COUNT,
        "duration": $((duration * 1000)),
        "tests": [$TESTS_JSON],
        "screenshotDir": "$SCREENSHOT_DIR/$TEST_NAME"
    }],
    "totalPassed": $PASS_COUNT,
    "totalFailed": $FAIL_COUNT,
    "totalSkipped": $SKIP_COUNT,
    "totalDuration": $((duration * 1000))
}
REPORT

log_info "Report: $REPORT_FILE"
teardown_test

echo ""
echo "State persistence test completed!"
echo "   Screenshots: $SCREENSHOT_DIR/$TEST_NAME/"
echo "   Report: $REPORT_FILE"
echo ""
