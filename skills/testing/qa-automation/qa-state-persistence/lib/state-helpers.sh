#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  state-helpers.sh — State Persistence Inspection & Mutation       ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  Source this file in state persistence test scripts:              ║
# ║    source "$(dirname "$0")/../lib/state-helpers.sh"               ║
# ║                                                                   ║
# ║  Provides:                                                        ║
# ║    • State debug hook installation                                ║
# ║    • Item state queries (any property at any index)              ║
# ║    • CDP-first state mutation with tap fallback                  ║
# ║    • Feed index tracking and scroll-to-index                     ║
# ║    • Assertion helpers for property values                        ║
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Source shared helpers (chains to test-helpers + cdp-helpers) ─────
STATE_SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCROLL_SKILL_DIR="$(cd "$STATE_SKILL_DIR/../qa-scroll" && pwd)"

source "$SCROLL_SKILL_DIR/lib/scroll-helpers.sh"

# ── Install State Debug Hook ────────────────────────────────────────
# Sets up a global accessor for reading feed item properties.
install_state_debug_hook() {
    cdp_eval_safe "
        globalThis.__qaItemState = function(targetIndex) {
            try {
                var feed = globalThis.${GLOBAL_FEED_VAR};
                if (!feed) return JSON.stringify({error: '${GLOBAL_FEED_VAR} not available', method: 'none'});

                var idx = (targetIndex !== undefined && targetIndex !== null) ? targetIndex : feed.currentIndex;

                // Method 1: getItem() directly
                if (typeof feed.getItem === 'function') {
                    var item = feed.getItem(idx);
                    if (item && typeof item === 'object') {
                        return JSON.stringify({
                            ok: true,
                            method: 'getItem',
                            index: idx,
                            ${STATE_PROPERTY}: !!item.${STATE_PROPERTY},
                            ${STATE_COUNTER_PROPERTY}: item.${STATE_COUNTER_PROPERTY} || 0,
                            id: item.id || item._id || 'unknown',
                            title: (item.description || item.title || item.name || '').substring(0, 50)
                        });
                    }
                }

                // Method 2: getData() array
                if (typeof feed.getData === 'function') {
                    var data = feed.getData();
                    if (data && idx < data.length && data[idx]) {
                        var it = data[idx];
                        return JSON.stringify({
                            ok: true,
                            method: 'getData',
                            index: idx,
                            ${STATE_PROPERTY}: !!it.${STATE_PROPERTY},
                            ${STATE_COUNTER_PROPERTY}: it.${STATE_COUNTER_PROPERTY} || 0,
                            id: it.id || it._id || 'unknown',
                            title: (it.description || it.title || it.name || '').substring(0, 50)
                        });
                    }
                }

                return JSON.stringify({
                    error: 'feed methods not available',
                    method: 'none',
                    hasGetItem: typeof feed.getItem === 'function',
                    hasGetData: typeof feed.getData === 'function',
                    dataLength: feed.dataLength,
                    currentIndex: feed.currentIndex
                });
            } catch(e) {
                return JSON.stringify({error: e.message, method: 'exception'});
            }
        };

        var feed = globalThis.${GLOBAL_FEED_VAR};
        return JSON.stringify({
            ok: true,
            hookInstalled: 'itemState',
            hasGetItem: !!(feed && typeof feed.getItem === 'function'),
            hasGetData: !!(feed && typeof feed.getData === 'function'),
            dataLength: feed ? feed.dataLength : 0
        });
    "
}

# ── Query Item State ─────────────────────────────────────────────────
# Returns JSON: {ok, STATE_PROPERTY, STATE_COUNTER_PROPERTY, id, ...}
query_item_state() {
    local target_index="${1:-}"
    local index_arg=""
    [ -n "$target_index" ] && index_arg="$target_index"

    local attempt=0
    local max_attempts=3
    local result=""

    while [ $attempt -lt $max_attempts ]; do
        result=$(cdp_eval "
            (function() {
                try {
                    if (globalThis.__qaItemState) {
                        return globalThis.__qaItemState($index_arg);
                    }
                    return JSON.stringify({error: 'state hook not installed'});
                } catch(e) {
                    return JSON.stringify({error: e.message});
                }
            })();
        " 2>/dev/null || echo '{"error":"cdp failed"}')

        local has_ok
        has_ok=$(echo "$result" | node -e "
            let d='';process.stdin.on('data',c=>d+=c);
            process.stdin.on('end',()=>{try{const o=JSON.parse(d);console.log(o.ok?'yes':'no')}catch(e){console.log('no')}});
        " 2>/dev/null || echo "no")

        if [ "$has_ok" = "yes" ]; then
            echo "$result"
            return 0
        fi

        attempt=$((attempt + 1))
        [ $attempt -lt $max_attempts ] && sleep 1
    done

    echo "$result"
}

# ── Feed Index ───────────────────────────────────────────────────────

get_current_feed_index() {
    local result
    result=$(cdp_eval "
        (function() {
            if (globalThis.${GLOBAL_FEED_VAR}) {
                return '' + (globalThis.${GLOBAL_FEED_VAR}.currentIndex || 0);
            }
            return '-1';
        })();
    " 2>/dev/null || echo "-1")
    echo "$result"
}

scroll_to_index() {
    local target_index="$1"
    step "Scrolling to feed index $target_index"
    local result
    result=$(cdp_eval "
        (function() {
            if (globalThis.${GLOBAL_FEED_VAR} && globalThis.${GLOBAL_FEED_VAR}.scrollToIndex) {
                var before = globalThis.${GLOBAL_FEED_VAR}.currentIndex;
                globalThis.${GLOBAL_FEED_VAR}.scrollToIndex($target_index);
                return JSON.stringify({ok:true, before:before, after:$target_index});
            }
            return JSON.stringify({error:'scrollToIndex not available'});
        })();
    " 2>/dev/null || echo '{"error":"cdp failed"}')
    log_info "Scroll to index result: $result"
    sleep 3
}

scroll_back_to_start() {
    local current_index
    current_index=$(get_current_feed_index)

    if [ "$current_index" = "-1" ] || [ "$current_index" = "0" ]; then
        log_info "Already at start or unknown index"
        return 0
    fi

    # Try scrollToIndex first
    local result
    result=$(cdp_eval "
        (function() {
            if (globalThis.${GLOBAL_FEED_VAR} && globalThis.${GLOBAL_FEED_VAR}.scrollToIndex) {
                globalThis.${GLOBAL_FEED_VAR}.scrollToIndex(0);
                return 'ok';
            }
            return 'no_hook';
        })();
    " 2>/dev/null || echo "error")

    if [ "$result" = "ok" ]; then
        log_info "Scrolled to index 0 via scrollToIndex"
        sleep 3
        return 0
    fi

    # Fallback: swipe down N times
    log_info "Using swipe-down fallback ($current_index times)"
    local i=0
    while [ $i -lt "$current_index" ]; do
        swipe $SWIPE_END_X $SWIPE_END_Y $SWIPE_START_X $SWIPE_START_Y
        sleep 2
        i=$((i + 1))
    done
}

# ── State Mutation ───────────────────────────────────────────────────

# Toggle a boolean property on the current feed item via CDP.
toggle_item_property_cdp() {
    local current_index
    current_index=$(get_current_feed_index)

    local result
    result=$(cdp_eval_safe "
        var feed = globalThis.${GLOBAL_FEED_VAR};
        if (!feed || typeof feed.getItem !== 'function') {
            return JSON.stringify({error: 'feed not available'});
        }

        var item = feed.getItem($current_index);
        if (!item) {
            return JSON.stringify({error: 'no item at index $current_index'});
        }

        try {
            var oldValue = !!item.${STATE_PROPERTY};
            item.${STATE_PROPERTY} = !oldValue;
            if (item.${STATE_COUNTER_PROPERTY} !== undefined) {
                item.${STATE_COUNTER_PROPERTY} = oldValue
                    ? (item.${STATE_COUNTER_PROPERTY} - 1)
                    : (item.${STATE_COUNTER_PROPERTY} + 1);
            }
            return JSON.stringify({ok: true, was: oldValue, now: !oldValue, id: item.id});
        } catch(e) {
            return JSON.stringify({error: e.message});
        }
    " 2>/dev/null || echo '{"error":"cdp failed"}')
    echo "$result"
}

# ── Assertion Helpers ────────────────────────────────────────────────

# Assert that item at index has the property set to true
assert_item_property_true() {
    local target_index="${1:-}"
    local state
    state=$(query_item_state "$target_index")

    local value
    value=$(echo "$state" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{try{const o=JSON.parse(d);console.log(o.${STATE_PROPERTY}?'true':'false')}catch(e){console.log('unknown')}});
    " 2>/dev/null || echo "unknown")

    if [ "$value" = "true" ]; then
        log_pass "Item ${STATE_PROPERTY} is true"
        return 0
    elif [ "$value" = "unknown" ]; then
        log_warn "Could not determine ${STATE_PROPERTY} state"
        return 2
    else
        log_fail "Item ${STATE_PROPERTY} is false (expected true)"
        return 1
    fi
}

# Assert that item at index has the property set to false
assert_item_property_false() {
    local target_index="${1:-}"
    local state
    state=$(query_item_state "$target_index")

    local value
    value=$(echo "$state" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{try{const o=JSON.parse(d);console.log(o.${STATE_PROPERTY}?'true':'false')}catch(e){console.log('unknown')}});
    " 2>/dev/null || echo "unknown")

    if [ "$value" = "false" ]; then
        log_pass "Item ${STATE_PROPERTY} is false (as expected)"
        return 0
    elif [ "$value" = "unknown" ]; then
        log_warn "Could not determine ${STATE_PROPERTY} state"
        return 2
    else
        log_fail "Item ${STATE_PROPERTY} is true (expected false)"
        return 1
    fi
}

echo "State persistence helpers loaded."
