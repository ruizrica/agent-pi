#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  cdp-helpers.sh — Chrome DevTools Protocol Helpers                ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  Source this file for CDP interaction with React Native apps:     ║
# ║    source "$(dirname "$0")/../../lib/cdp-helpers.sh"              ║
# ║                                                                   ║
# ║  Provides:                                                        ║
# ║    • CDP evaluation (cdp_eval, cdp_eval_safe)                    ║
# ║    • Navigation (cdp_navigate, cdp_navigate_tab)                 ║
# ║    • State queries (cdp_get_route, cdp_get_state)                ║
# ║    • Auto-discovery (CDP target, navigation module)               ║
# ║                                                                   ║
# ║  Requires: Node.js, 'ws' npm package, Metro dev server running   ║
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Source configuration ─────────────────────────────────────────────
CDP_HELPERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDP_QA_ROOT="$(cd "$CDP_HELPERS_DIR/../.." && pwd)"

# Only source config if not already loaded
if [ -z "${QA_AUTOMATION_DIR:-}" ]; then
    source "$CDP_QA_ROOT/qa.config.sh"
fi

# ── CDP State ────────────────────────────────────────────────────────
_CDP_WS_URL_RESOLVED=""
_CDP_NAV_MODULE_ID=""

# ── CDP Auto-Discovery ──────────────────────────────────────────────

# Ensure we have a CDP WebSocket URL
_ensure_cdp_ws_url() {
    if [ -n "$_CDP_WS_URL_RESOLVED" ]; then
        echo "$_CDP_WS_URL_RESOLVED"
        return 0
    fi

    local ws_url
    ws_url=$(qa_detect_cdp_ws_url 2>/dev/null || echo "")

    if [ -n "$ws_url" ]; then
        _CDP_WS_URL_RESOLVED="$ws_url"
        echo "$ws_url"
        return 0
    fi

    # Last resort: construct from config
    if [ "$CDP_WS_URL" != "auto" ] && [ -n "$CDP_WS_URL" ]; then
        _CDP_WS_URL_RESOLVED="$CDP_WS_URL"
        echo "$CDP_WS_URL"
        return 0
    fi

    echo ""
    return 1
}

# Ensure we have a navigation module ID
_ensure_nav_module_id() {
    if [ -n "$_CDP_NAV_MODULE_ID" ]; then
        echo "$_CDP_NAV_MODULE_ID"
        return 0
    fi

    # Check cache
    if [ -f "$NAV_MODULE_CACHE" ]; then
        local cached
        cached=$(cat "$NAV_MODULE_CACHE" 2>/dev/null || echo "")
        if [ -n "$cached" ]; then
            _CDP_NAV_MODULE_ID="$cached"
            echo "$cached"
            return 0
        fi
    fi

    # Auto-detect
    local module_id
    module_id=$(qa_detect_nav_module 2>/dev/null || echo "")

    if [ -n "$module_id" ]; then
        _CDP_NAV_MODULE_ID="$module_id"
        echo "$module_id"
        return 0
    fi

    echo ""
    return 1
}

# ── Core CDP Functions ───────────────────────────────────────────────

# Execute JavaScript in the React Native Hermes runtime via CDP.
# Usage: cdp_eval "javascript expression"
# Returns: the evaluated result
cdp_eval() {
    local expression="$1"
    local ws_url
    ws_url=$(_ensure_cdp_ws_url)

    if [ -z "$ws_url" ]; then
        echo '{"error":"no CDP WebSocket URL"}'
        return 1
    fi

    cd "$PROJECT_DIR"
    node -e "
const WebSocket=require('ws');
const ws=new WebSocket('$ws_url');
ws.on('open',()=>{
  ws.send(JSON.stringify({
    id:1,
    method:'Runtime.evaluate',
    params:{
      expression: \`$expression\`,
      returnByValue:true
    }
  }));
});
ws.on('message',d=>{
  const m=JSON.parse(d);
  if(m.id===1){
    if(m.result?.result?.value) console.log(m.result.result.value);
    else if(m.result?.exceptionDetails) console.error('CDP Error:', m.result.exceptionDetails.text);
    else console.log(JSON.stringify(m.result));
    ws.close();
    process.exit(0);
  }
});
ws.on('error',e=>{console.error('WS Error:',e.message);process.exit(1)});
setTimeout(()=>{console.error('CDP Timeout');process.exit(1)},8000);
" 2>&1
}

# Safe CDP eval — suppresses ErrorUtils/LogBox during execution.
# Use for any eval that touches Metro modules or could trigger side effects.
# Usage: cdp_eval_safe "javascript expression"
cdp_eval_safe() {
    local expression="$1"
    cdp_eval "
        (function() {
            var _origHandler = globalThis.ErrorUtils ? ErrorUtils.getGlobalHandler() : null;
            var _origCE = console.error;
            if (globalThis.ErrorUtils) ErrorUtils.setGlobalHandler(function() {});
            console.error = function() {};
            try {
                return (function() { $expression })();
            } finally {
                if (globalThis.ErrorUtils && _origHandler) ErrorUtils.setGlobalHandler(_origHandler);
                console.error = _origCE;
            }
        })();
    "
}

# ── Navigation Functions ─────────────────────────────────────────────

# Navigate to a screen by name.
# Usage: cdp_navigate "ScreenName" [params_json]
cdp_navigate() {
    local screen="$1"
    local params="${2:-}"
    local nav_id
    nav_id=$(_ensure_nav_module_id)

    if [ -z "$nav_id" ]; then
        echo '{"error":"navigation module not found"}'
        return 1
    fi

    if [ -n "$params" ]; then
        cdp_eval "
            const ref = __r(${nav_id}).navigationRef;
            ref.current.navigate('${screen}', ${params});
            JSON.stringify({ ok: true, route: ref.current.getCurrentRoute()?.name });
        "
    else
        cdp_eval "
            const ref = __r(${nav_id}).navigationRef;
            ref.current.navigate('${screen}');
            JSON.stringify({ ok: true, route: ref.current.getCurrentRoute()?.name });
        "
    fi
}

# Navigate to a bottom tab screen.
# Usage: cdp_navigate_tab "ScreenName"
cdp_navigate_tab() {
    local tab="$1"
    local nav_id
    nav_id=$(_ensure_nav_module_id)

    if [ -z "$nav_id" ]; then
        echo '{"error":"navigation module not found"}'
        return 1
    fi

    cdp_eval "
        const ref = __r(${nav_id}).navigationRef;
        ref.current.navigate('${TAB_NAVIGATOR_NAME}', { screen: '${tab}' });
        JSON.stringify({ ok: true, route: ref.current.getCurrentRoute()?.name });
    "
}

# Get current route name.
# Usage: route=$(cdp_get_route)
cdp_get_route() {
    local nav_id
    nav_id=$(_ensure_nav_module_id)

    if [ -z "$nav_id" ]; then
        echo "unknown"
        return 1
    fi

    cdp_eval "
        const ref = __r(${nav_id}).navigationRef;
        ref.current.getCurrentRoute()?.name || 'unknown';
    "
}

# Get full navigation state as JSON.
cdp_get_state() {
    local nav_id
    nav_id=$(_ensure_nav_module_id)

    if [ -z "$nav_id" ]; then
        echo '{"error":"navigation module not found"}'
        return 1
    fi

    cdp_eval "
        const ref = __r(${nav_id}).navigationRef;
        const state = ref.current.getRootState();
        function getRoutes(s, depth) {
            let routes = [];
            if (s.routes) {
                for (const r of s.routes) {
                    routes.push({name: r.name, depth});
                    if (r.state) routes = routes.concat(getRoutes(r.state, depth+1));
                }
            }
            return routes;
        }
        JSON.stringify({
            current: ref.current.getCurrentRoute()?.name,
            routes: getRoutes(state, 0)
        });
    "
}

# Go back in navigation.
cdp_go_back() {
    local nav_id
    nav_id=$(_ensure_nav_module_id)

    if [ -z "$nav_id" ]; then
        echo "error: no nav module"
        return 1
    fi

    cdp_eval "
        const ref = __r(${nav_id}).navigationRef;
        if (ref.current.canGoBack()) {
            ref.current.goBack();
            'went back to: ' + ref.current.getCurrentRoute()?.name;
        } else {
            'cannot go back';
        }
    "
}

# Reset navigation to initial state.
cdp_reset_navigation() {
    local nav_id
    nav_id=$(_ensure_nav_module_id)

    if [ -z "$nav_id" ]; then
        echo "error: no nav module"
        return 1
    fi

    cdp_eval "
        const ref = __r(${nav_id}).navigationRef;
        ref.current.reset({
            index: 0,
            routes: [{ name: 'Main', state: { routes: [{ name: '${TAB_NAVIGATOR_NAME}' }] } }]
        });
        'reset to ${TAB_NAVIGATOR_NAME}';
    "
}

# ── Convenience Tab Navigation ───────────────────────────────────────
# These use the screen names from qa.config.sh

nav_tab_1() { [ -n "$SCREEN_EXPLORE" ] && cdp_navigate_tab "$SCREEN_EXPLORE" || echo "SCREEN_EXPLORE not configured"; }
nav_tab_2() { [ -n "$SCREEN_SEARCH" ] && cdp_navigate_tab "$SCREEN_SEARCH" || echo "SCREEN_SEARCH not configured"; }
nav_tab_3() { [ -n "$SCREEN_HOME" ] && cdp_navigate_tab "$SCREEN_HOME" || echo "SCREEN_HOME not configured"; }
nav_tab_4() { echo "Tab 4 not configured — set SCREEN name and add to cdp-helpers.sh"; }
nav_tab_5() { [ -n "$SCREEN_PROFILE" ] && cdp_navigate_tab "$SCREEN_PROFILE" || echo "SCREEN_PROFILE not configured"; }

# Generic by name
nav_explore() { nav_tab_1; }
nav_search()  { nav_tab_2; }
nav_home()    { nav_tab_3; }
nav_profile() { nav_tab_5; }

# ── Utility Functions ────────────────────────────────────────────────

# Check if user is logged in (heuristic: check current route)
cdp_is_logged_in() {
    local route
    route=$(cdp_get_route 2>/dev/null || echo "unknown")
    if echo "$route" | grep -qiE "login|signup|auth|welcome|launch"; then
        echo "false"
    else
        echo "true"
    fi
}

# Clear cached module IDs (force re-discovery on next call)
cdp_clear_cache() {
    _CDP_WS_URL_RESOLVED=""
    _CDP_NAV_MODULE_ID=""
    [ -f "$NAV_MODULE_CACHE" ] && rm -f "$NAV_MODULE_CACHE" 2>/dev/null || true
    [ -f "$VIDEO_MODULE_CACHE" ] && rm -f "$VIDEO_MODULE_CACHE" 2>/dev/null || true
    echo "CDP cache cleared"
}

# ── Export Functions ─────────────────────────────────────────────────

export -f cdp_eval cdp_eval_safe 2>/dev/null || true
export -f cdp_navigate cdp_navigate_tab cdp_get_route cdp_get_state 2>/dev/null || true
export -f cdp_go_back cdp_reset_navigation cdp_is_logged_in 2>/dev/null || true
export -f nav_explore nav_search nav_home nav_profile 2>/dev/null || true
export -f cdp_clear_cache 2>/dev/null || true

echo "CDP helpers loaded. WebSocket: ${_CDP_WS_URL_RESOLVED:-auto-detect}"
