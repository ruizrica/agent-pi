#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  Example Smoke Test — Quick Verification of Core Flows            ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  CUSTOMIZE: Replace screen names and navigation with your app's.  ║
# ║                                                                   ║
# ║  Usage: bash skills/testing/qa-automation/qa-test-flows/flows/smoke/example-smoke.sh
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../lib/test-helpers.sh"
source "$SCRIPT_DIR/../../lib/cdp-helpers.sh"

TEST_NAME="smoke-test"
setup_test "$TEST_NAME"

# ── Step 1: App Launch ───────────────────────────────────────────────
step "Verify app is running"
assert_app_foreground || {
    launch_app
    sleep 3
}
take_screenshot "01-app-launched"
assert_screenshot "01-app-launched"
log_pass "App is running"

# ── Step 2: Check Login State ────────────────────────────────────────
step "Check authentication state"
logged_in=$(cdp_is_logged_in 2>/dev/null || echo "unknown")
log_info "Logged in: $logged_in"

if [ "$logged_in" = "false" ]; then
    log_warn "App is on login screen — some tests may be skipped"
fi
take_screenshot "02-auth-state"

# ── Step 3: Navigate Through Main Tabs ───────────────────────────────
# CUSTOMIZE: Replace with your app's tab screens

step "Navigate to Tab 1 (Explore/Home)"
nav_explore 2>/dev/null || tap_tab 1
sleep 2
take_screenshot "03-tab-1"
route=$(cdp_get_route 2>/dev/null || echo "unknown")
log_info "Route: $route"
log_pass "Tab 1 loaded"

step "Navigate to Tab 2 (Search)"
nav_search 2>/dev/null || tap_tab 2
sleep 2
take_screenshot "04-tab-2"
route=$(cdp_get_route 2>/dev/null || echo "unknown")
log_info "Route: $route"
log_pass "Tab 2 loaded"

step "Navigate to Tab 3 (Home/Create)"
nav_home 2>/dev/null || tap_tab 3
sleep 2
take_screenshot "05-tab-3"
route=$(cdp_get_route 2>/dev/null || echo "unknown")
log_info "Route: $route"
log_pass "Tab 3 loaded"

step "Navigate to Tab 5 (Profile)"
nav_profile 2>/dev/null || tap_tab 5
sleep 2
take_screenshot "06-tab-5"
route=$(cdp_get_route 2>/dev/null || echo "unknown")
log_info "Route: $route"
log_pass "Tab 5 loaded"

# ── Step 4: Navigate to Detail Screen ────────────────────────────────
# CUSTOMIZE: Replace with a screen in your app

step "Navigate to Settings (detail screen)"
cdp_navigate "$SCREEN_SETTINGS" 2>/dev/null || {
    log_warn "CDP navigation failed — trying tap"
    tap $SETTINGS_BUTTON_X $SETTINGS_BUTTON_Y
}
sleep 2
take_screenshot "07-settings"
route=$(cdp_get_route 2>/dev/null || echo "unknown")
log_info "Route: $route"

# ── Step 5: Go Back ──────────────────────────────────────────────────
step "Navigate back"
cdp_go_back 2>/dev/null || go_back
sleep 2
take_screenshot "08-back"
route=$(cdp_get_route 2>/dev/null || echo "unknown")
log_info "Route after back: $route"
log_pass "Back navigation works"

# ── Step 6: Final State ─────────────────────────────────────────────
step "Final state check"
assert_app_foreground
take_screenshot "09-final"
log_pass "Smoke test complete — app is stable"

# ── Report ───────────────────────────────────────────────────────────
teardown_test

echo ""
echo "Smoke test completed!"
echo "   Screenshots: $SCREENSHOT_DIR/$TEST_NAME/"
echo ""
