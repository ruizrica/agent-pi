#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  Example Web Test — Form Submission & Navigation                  ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  CUSTOMIZE: Replace URLs, selectors, and assertions for your app. ║
# ║                                                                   ║
# ║  Usage: bash .pi/skills/qa-automation/qa-web/flows/example-web-test.sh
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/web-helpers.sh"

TEST_NAME="web-form-test"
setup_test "$TEST_NAME"

# ── Step 1: Open the web app ────────────────────────────────────────
step "Open web app"
web_open "$WEB_BASE_URL"
web_screenshot "01-homepage"

url=$(web_get_url)
log_info "URL: $url"
log_pass "Web app loaded"

# ── Step 2: Take a snapshot of interactive elements ──────────────────
step "Snapshot interactive elements"
snapshot=$(web_snapshot)
log_info "Snapshot:"
echo "$snapshot" | head -20

web_screenshot "02-snapshot"

# ── Step 3: Navigate to a page ──────────────────────────────────────
# CUSTOMIZE: Change the selector to match your app's navigation
step "Navigate to a page"
# web_click @e3  # Click a nav link (use ref from snapshot)
# Or navigate directly:
# web_open "$WEB_BASE_URL/about"
sleep 1

url=$(web_get_url)
log_info "URL after navigation: $url"
web_screenshot "03-navigated"
log_pass "Navigation successful"

# ── Step 4: Fill and submit a form ──────────────────────────────────
# CUSTOMIZE: Replace with your app's form fields
step "Fill form (if present)"
# web_snapshot  # Get fresh refs
# web_fill @e1 "Jane Doe"
# web_fill @e2 "jane@example.com"
# web_click @e5  # Submit button
# web_wait_network
# web_screenshot "04-form-submitted"

log_info "Form step skipped — customize for your app"
web_screenshot "04-current-state"

# ── Step 5: Check responsive layout ─────────────────────────────────
step "Check responsive layouts"

# Desktop
web_set_viewport 1440 900
sleep 1
web_screenshot "05a-desktop"
log_pass "Desktop viewport captured"

# Tablet
web_set_viewport 768 1024
sleep 1
web_screenshot "05b-tablet"
log_pass "Tablet viewport captured"

# Mobile
web_set_viewport 375 812
sleep 1
web_screenshot "05c-mobile"
log_pass "Mobile viewport captured"

# Reset
web_set_viewport "$WEB_VIEWPORT_WIDTH" "$WEB_VIEWPORT_HEIGHT"

# ── Step 6: Final state ─────────────────────────────────────────────
step "Final state check"
title=$(web_get_title)
url=$(web_get_url)
log_info "Title: $title"
log_info "URL: $url"

web_screenshot "06-final"
log_pass "Web test complete"

# ── Cleanup ──────────────────────────────────────────────────────────
web_close

teardown_test

echo ""
echo "Web test completed!"
echo "   Screenshots: $SCREENSHOT_DIR/$TEST_NAME/"
echo ""
