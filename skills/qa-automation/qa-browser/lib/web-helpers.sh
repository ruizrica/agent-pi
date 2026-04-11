#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  web-helpers.sh — Web Test Helpers using agent-browser            ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  Source this file in web test scripts:                            ║
# ║    source "$(dirname "$0")/../lib/web-helpers.sh"                 ║
# ║                                                                   ║
# ║  Provides consistent wrappers around agent-browser commands       ║
# ║  with the same test lifecycle as native test-helpers.sh.          ║
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Source configuration and test framework ──────────────────────────
WEB_HELPERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QA_ROOT_WEB="$(cd "$WEB_HELPERS_DIR/../.." && pwd)"

source "$QA_ROOT_WEB/qa.config.sh"

# Source test-helpers for lifecycle (setup_test, teardown_test, step, log_*)
source "$QA_ROOT_WEB/qa-test-flows/lib/test-helpers.sh"

# ── Session flags ────────────────────────────────────────────────────
_WEB_SESSION_FLAG=""
[ -n "$WEB_SESSION" ] && _WEB_SESSION_FLAG="--session $WEB_SESSION"

_WEB_HEADED_FLAG=""
[ "${WEB_HEADED:-false}" = "true" ] && _WEB_HEADED_FLAG="--headed"

# ── Navigation ───────────────────────────────────────────────────────

# Open a URL in the browser
web_open() {
    local url="$1"
    agent-browser $_WEB_SESSION_FLAG $_WEB_HEADED_FLAG open "$url" 2>/dev/null || {
        log_warn "Failed to open: $url"
        return 1
    }
    sleep 1
}

# Get interactive element snapshot (refs like @e1, @e2)
web_snapshot() {
    agent-browser $_WEB_SESSION_FLAG snapshot -i 2>/dev/null || echo "(snapshot failed)"
}

# Full accessibility tree snapshot
web_full_snapshot() {
    agent-browser $_WEB_SESSION_FLAG snapshot 2>/dev/null || echo "(snapshot failed)"
}

# ── Interaction ──────────────────────────────────────────────────────

# Click an element by ref or selector
web_click() {
    local target="$1"
    agent-browser $_WEB_SESSION_FLAG click "$target" 2>/dev/null || {
        log_warn "Click failed: $target"
        return 1
    }
    sleep 0.5
}

# Fill an input field (clears first)
web_fill() {
    local target="$1"
    local text="$2"
    agent-browser $_WEB_SESSION_FLAG fill "$target" "$text" 2>/dev/null || {
        log_warn "Fill failed: $target"
        return 1
    }
    sleep 0.3
}

# Type text without clearing
web_type() {
    local target="$1"
    local text="$2"
    agent-browser $_WEB_SESSION_FLAG type "$target" "$text" 2>/dev/null || {
        log_warn "Type failed: $target"
        return 1
    }
    sleep 0.3
}

# Select dropdown option
web_select() {
    local target="$1"
    local value="$2"
    agent-browser $_WEB_SESSION_FLAG select "$target" "$value" 2>/dev/null || {
        log_warn "Select failed: $target $value"
        return 1
    }
    sleep 0.3
}

# Check a checkbox
web_check() {
    local target="$1"
    agent-browser $_WEB_SESSION_FLAG check "$target" 2>/dev/null || return 1
}

# Uncheck a checkbox
web_uncheck() {
    local target="$1"
    agent-browser $_WEB_SESSION_FLAG uncheck "$target" 2>/dev/null || return 1
}

# Press a key
web_press() {
    local key="$1"
    agent-browser $_WEB_SESSION_FLAG press "$key" 2>/dev/null || return 1
}

# Hover over an element
web_hover() {
    local target="$1"
    agent-browser $_WEB_SESSION_FLAG hover "$target" 2>/dev/null || return 1
}

# ── Wait ─────────────────────────────────────────────────────────────

# Wait for element, time, or network idle
web_wait() {
    local target="$1"
    agent-browser $_WEB_SESSION_FLAG wait "$target" 2>/dev/null || return 1
}

# Wait for network idle
web_wait_network() {
    agent-browser $_WEB_SESSION_FLAG wait --load networkidle 2>/dev/null || return 1
}

# Wait for specific text to appear
web_wait_text() {
    local text="$1"
    agent-browser $_WEB_SESSION_FLAG wait --text "$text" 2>/dev/null || return 1
}

# ── Get Information ──────────────────────────────────────────────────

# Get element text
web_get_text() {
    local target="$1"
    agent-browser $_WEB_SESSION_FLAG get text "$target" 2>/dev/null || echo ""
}

# Get current URL
web_get_url() {
    agent-browser $_WEB_SESSION_FLAG get url 2>/dev/null || echo ""
}

# Get page title
web_get_title() {
    agent-browser $_WEB_SESSION_FLAG get title 2>/dev/null || echo ""
}

# Get element attribute
web_get_attr() {
    local target="$1"
    local attr="$2"
    agent-browser $_WEB_SESSION_FLAG get attr "$target" "$attr" 2>/dev/null || echo ""
}

# Get input value
web_get_value() {
    local target="$1"
    agent-browser $_WEB_SESSION_FLAG get value "$target" 2>/dev/null || echo ""
}

# Count matching elements
web_count() {
    local selector="$1"
    agent-browser $_WEB_SESSION_FLAG get count "$selector" 2>/dev/null || echo "0"
}

# ── Check State ──────────────────────────────────────────────────────

# Check if element is visible
web_is_visible() {
    local target="$1"
    agent-browser $_WEB_SESSION_FLAG is visible "$target" 2>/dev/null && echo "true" || echo "false"
}

# Check if element is enabled
web_is_enabled() {
    local target="$1"
    agent-browser $_WEB_SESSION_FLAG is enabled "$target" 2>/dev/null && echo "true" || echo "false"
}

# Check if checkbox is checked
web_is_checked() {
    local target="$1"
    agent-browser $_WEB_SESSION_FLAG is checked "$target" 2>/dev/null && echo "true" || echo "false"
}

# ── Screenshots ──────────────────────────────────────────────────────

# Take a screenshot with test naming convention
web_screenshot() {
    local name="$1"
    local path="$SCREENSHOT_DIR/$TEST_NAME/${name}.png"
    mkdir -p "$(dirname "$path")"
    agent-browser $_WEB_SESSION_FLAG screenshot "$path" 2>/dev/null || {
        log_warn "Web screenshot failed: $name"
        return 1
    }
    echo "$path"
}

# Full-page screenshot
web_screenshot_full() {
    local name="$1"
    local path="$SCREENSHOT_DIR/$TEST_NAME/${name}.png"
    mkdir -p "$(dirname "$path")"
    agent-browser $_WEB_SESSION_FLAG screenshot "$path" --full 2>/dev/null || {
        log_warn "Full web screenshot failed: $name"
        return 1
    }
    echo "$path"
}

# ── Scroll ───────────────────────────────────────────────────────────

# Scroll page
web_scroll() {
    local direction="${1:-down}"
    local amount="${2:-300}"
    agent-browser $_WEB_SESSION_FLAG scroll "$direction" "$amount" 2>/dev/null || return 1
}

# Scroll element into view
web_scroll_into_view() {
    local target="$1"
    agent-browser $_WEB_SESSION_FLAG scrollintoview "$target" 2>/dev/null || return 1
}

# ── State Management ─────────────────────────────────────────────────

# Save browser state (cookies, localStorage, auth)
web_save_state() {
    local path="$1"
    agent-browser $_WEB_SESSION_FLAG state save "$path" 2>/dev/null || {
        log_warn "Failed to save state to: $path"
        return 1
    }
    log_info "Browser state saved to: $path"
}

# Load browser state
web_load_state() {
    local path="$1"
    if [ -f "$path" ]; then
        agent-browser $_WEB_SESSION_FLAG state load "$path" 2>/dev/null || {
            log_warn "Failed to load state from: $path"
            return 1
        }
        log_info "Browser state loaded from: $path"
    else
        log_warn "State file not found: $path"
        return 1
    fi
}

# ── Assertion Helpers ────────────────────────────────────────────────

# Assert current URL matches pattern
web_assert_url() {
    local pattern="$1"
    local url
    url=$(web_get_url)

    if echo "$url" | grep -q "$pattern"; then
        log_pass "URL matches: $pattern"
        return 0
    else
        log_fail "URL mismatch: expected '$pattern', got '$url'"
        return 1
    fi
}

# Assert page title contains text
web_assert_title() {
    local expected="$1"
    local title
    title=$(web_get_title)

    if echo "$title" | grep -qi "$expected"; then
        log_pass "Title contains: $expected"
        return 0
    else
        log_fail "Title mismatch: expected '$expected', got '$title'"
        return 1
    fi
}

# Assert text is visible on page
web_assert_text() {
    local text="$1"
    local body
    body=$(agent-browser $_WEB_SESSION_FLAG get text body 2>/dev/null || echo "")

    if echo "$body" | grep -qi "$text"; then
        log_pass "Text visible: $text"
        return 0
    else
        log_fail "Text not found: $text"
        return 1
    fi
}

# Assert element is visible
web_assert_visible() {
    local target="$1"
    local visible
    visible=$(web_is_visible "$target")

    if [ "$visible" = "true" ]; then
        log_pass "Element visible: $target"
        return 0
    else
        log_fail "Element NOT visible: $target"
        return 1
    fi
}

# ── Browser Lifecycle ────────────────────────────────────────────────

# Close the browser session
web_close() {
    agent-browser $_WEB_SESSION_FLAG close 2>/dev/null || true
}

# Set viewport size
web_set_viewport() {
    local width="${1:-$WEB_VIEWPORT_WIDTH}"
    local height="${2:-$WEB_VIEWPORT_HEIGHT}"
    agent-browser $_WEB_SESSION_FLAG set viewport "$width" "$height" 2>/dev/null || return 1
}

# Emulate a mobile device
web_set_device() {
    local device="$1"
    agent-browser $_WEB_SESSION_FLAG set device "$device" 2>/dev/null || return 1
}

echo "Web helpers loaded. Base URL: $WEB_BASE_URL | Session: ${WEB_SESSION:-default}"
