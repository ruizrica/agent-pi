#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  setup-guard.sh — Prerequisites Checker & Auto-Fixer             ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  Source at the top of any test flow or runner script:             ║
# ║    source "$(dirname "$0")/../lib/setup-guard.sh"                 ║
# ║                                                                   ║
# ║  Checks (in order):                                              ║
# ║    1. iOS Simulator booted                                        ║
# ║    2. Dev server (Metro/Vite/etc.) running                       ║
# ║    3. App in foreground                                           ║
# ║    4. CDP Hermes target available                                 ║
# ║    5. CDP connection functional (eval 1+1)                       ║
# ║    6. Navigation module ID valid                                  ║
# ║    7. LogBox/error overlay dismissed                             ║
# ║                                                                   ║
# ║  Each check logs [SETUP] with OK/FIXING/FAILED status.          ║
# ║  If a critical check fails, the guard exits non-zero.            ║
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Source configuration and helpers ─────────────────────────────────
SETUP_GUARD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_ROOT_SG="$(cd "$SETUP_GUARD_DIR/.." && pwd)"

# Source config if not already loaded
if [ -z "${QA_AUTOMATION_DIR:-}" ]; then
    source "$QA_ROOT_SG/qa.config.sh"
fi

# Track state
_SETUP_GUARD_RAN=false
_SETUP_CDP_WS_URL=""

# ── Logging ──────────────────────────────────────────────────────────

_setup_log() {
    local status="$1"
    local message="$2"
    printf "  [SETUP] %-40s %s\n" "$message" "$status"
}

_setup_ok()      { _setup_log "OK"      "$1"; }
_setup_fixing()  { _setup_log "FIXING"  "$1"; }
_setup_failed()  { _setup_log "FAILED"  "$1"; }
_setup_skip()    { _setup_log "SKIP"    "$1"; }

# ── 1. Check/Boot Native Device ─────────────────────────────────────

_android_adb_bin() {
    local adb_bin="$ADB_PATH"
    if [ ! -x "$adb_bin" ]; then
        adb_bin=$(command -v adb 2>/dev/null || echo "")
    fi
    if [ -z "$adb_bin" ]; then
        return 1
    fi
    echo "$adb_bin"
}

_check_ios_simulator() {
    # Auto-detect UDID if needed
    if [ "$SIMULATOR_UDID" = "auto" ]; then
        local detected
        detected=$(qa_detect_simulator_udid 2>/dev/null || echo "")
        if [ -n "$detected" ]; then
            SIMULATOR_UDID="$detected"
            export SIMULATOR_UDID
            _setup_ok "iOS Simulator auto-detected: $SIMULATOR_UDID"
            return 0
        fi

        # No booted simulator — try to find any available one and boot it
        _setup_fixing "No booted iOS simulator — finding one to boot..."
        local first_sim
        first_sim=$(xcrun simctl list devices available 2>/dev/null | grep "iPhone" | head -1 | grep -oE '[A-F0-9-]{36}' || echo "")

        if [ -n "$first_sim" ]; then
            xcrun simctl boot "$first_sim" 2>/dev/null || true
            open -a Simulator 2>/dev/null || true
            sleep 5
            SIMULATOR_UDID="$first_sim"
            export SIMULATOR_UDID
            _setup_ok "iOS Simulator booted: $SIMULATOR_UDID"
            return 0
        fi

        _setup_failed "No iOS Simulator found"
        return 1
    fi

    # Specific UDID provided
    local booted
    booted=$(xcrun simctl list devices 2>/dev/null | grep "$SIMULATOR_UDID" | grep -c "Booted" || true)

    if [ "$booted" -ge 1 ]; then
        _setup_ok "iOS Simulator booted"
        return 0
    fi

    _setup_fixing "iOS Simulator not booted — booting..."
    xcrun simctl boot "$SIMULATOR_UDID" 2>/dev/null || true
    open -a Simulator 2>/dev/null || true
    sleep 5

    booted=$(xcrun simctl list devices 2>/dev/null | grep "$SIMULATOR_UDID" | grep -c "Booted" || true)
    if [ "$booted" -ge 1 ]; then
        _setup_ok "iOS Simulator booted (after fix)"
        return 0
    fi

    _setup_failed "iOS Simulator could not be booted"
    return 1
}

_check_android_emulator() {
    local adb_bin
    adb_bin=$(_android_adb_bin) || {
        _setup_failed "adb not found (set ADB_PATH or install Android platform-tools)"
        return 1
    }
    ADB_PATH="$adb_bin"
    export ADB_PATH

    "$adb_bin" start-server >/dev/null 2>&1 || true

    local detected=""
    if [ "$ANDROID_SERIAL" = "auto" ]; then
        detected=$(qa_detect_android_serial 2>/dev/null || echo "")
        if [ -n "$detected" ]; then
            ANDROID_SERIAL="$detected"
            export ANDROID_SERIAL
        fi
    fi

    local state=""
    if [ "$ANDROID_SERIAL" != "auto" ]; then
        state=$("$adb_bin" -s "$ANDROID_SERIAL" get-state 2>/dev/null || echo "")
    fi

    if [ "$state" != "device" ]; then
        _setup_fixing "Android emulator not running — starting AVD: $ANDROID_AVD"
        local emulator_bin="$EMULATOR_PATH"
        if [ ! -x "$emulator_bin" ]; then
            emulator_bin=$(command -v emulator 2>/dev/null || echo "")
        fi
        if [ -z "$emulator_bin" ]; then
            _setup_failed "Android emulator binary not found (set EMULATOR_PATH)"
            return 1
        fi
        if ! "$emulator_bin" -list-avds 2>/dev/null | grep -qx "$ANDROID_AVD"; then
            _setup_failed "Android AVD not found: $ANDROID_AVD"
            return 1
        fi
        nohup "$emulator_bin" -avd "$ANDROID_AVD" -netdelay none -netspeed full >/tmp/qa-android-emulator.log 2>&1 &
        sleep 3
    fi

    local elapsed=0
    local booted=""
    while [ $elapsed -lt $ANDROID_BOOT_TIMEOUT ]; do
        if [ "$ANDROID_SERIAL" = "auto" ]; then
            detected=$(qa_detect_android_serial 2>/dev/null || echo "")
            if [ -n "$detected" ]; then
                ANDROID_SERIAL="$detected"
                export ANDROID_SERIAL
            fi
        fi

        if [ "$ANDROID_SERIAL" != "auto" ]; then
            state=$("$adb_bin" -s "$ANDROID_SERIAL" get-state 2>/dev/null || echo "")
            booted=$("$adb_bin" -s "$ANDROID_SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || echo "")
            if [ "$state" = "device" ] && [ "$booted" = "1" ]; then
                _setup_ok "Android emulator ready: $ANDROID_SERIAL"
                return 0
            fi
        fi

        sleep 2
        elapsed=$((elapsed + 2))
    done

    _setup_failed "Android emulator did not become ready within ${ANDROID_BOOT_TIMEOUT}s"
    return 1
}

_check_simulator() {
    case "${QA_PLATFORM:-ios}" in
        android) _check_android_emulator ;;
        ios)     _check_ios_simulator ;;
        *)       _setup_failed "Unsupported QA platform: ${QA_PLATFORM:-}"; return 1 ;;
    esac
}

# ── 2. Check/Start Dev Server ────────────────────────────────────────

_check_dev_server() {
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "$DEV_SERVER_HEALTH" 2>/dev/null || echo "000")

    if [ "$status_code" = "200" ]; then
        _setup_ok "Dev server running on :${METRO_PORT}"
        return 0
    fi

    _setup_fixing "Dev server not running — starting in background..."
    cd "$PROJECT_DIR"
    eval "$DEV_SERVER_CMD" > /tmp/qa-dev-server.log 2>&1 &
    local server_pid=$!
    echo "$server_pid" > /tmp/qa-dev-server.pid

    local elapsed=0
    while [ $elapsed -lt $DEV_SERVER_TIMEOUT ]; do
        status_code=$(curl -s -o /dev/null -w "%{http_code}" "$DEV_SERVER_HEALTH" 2>/dev/null || echo "000")
        if [ "$status_code" = "200" ]; then
            _setup_ok "Dev server started (took ${elapsed}s)"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    _setup_failed "Dev server did not start within ${DEV_SERVER_TIMEOUT}s"
    return 1
}

# ── 3. Check/Launch App in Foreground ────────────────────────────────

_check_app_foreground() {
    local launch_result

    if qa_is_android; then
        local adb_bin
        adb_bin=$(_android_adb_bin) || {
            _setup_failed "adb not found for Android app launch"
            return 1
        }
        ADB_PATH="$adb_bin"
        export ADB_PATH

        "$adb_bin" -s "$ANDROID_SERIAL" shell am force-stop "$APP_BUNDLE_ID" 2>/dev/null || true
        sleep 1
        launch_result=$("$adb_bin" -s "$ANDROID_SERIAL" shell monkey -p "$APP_BUNDLE_ID" -c android.intent.category.LAUNCHER 1 2>&1 || true)
        sleep "$APP_SETTLE_TIME"

        if echo "$launch_result" | grep -qi "Events injected: 1"; then
            _setup_ok "Android app launched and in foreground ($APP_BUNDLE_ID)"
            return 0
        fi

        _setup_failed "Could not launch Android app ($APP_BUNDLE_ID)"
        return 1
    fi

    # Use xcrun simctl launch (idempotent: if already running, brings to front)
    launch_result=$(xcrun simctl launch "$SIMULATOR_UDID" "$APP_BUNDLE_ID" 2>&1 || true)

    if echo "$launch_result" | grep -q "$APP_BUNDLE_ID"; then
        _setup_ok "iOS app in foreground ($APP_BUNDLE_ID)"
        sleep 2
        return 0
    fi

    _setup_fixing "iOS app not launching — terminating and retrying..."
    xcrun simctl terminate "$SIMULATOR_UDID" "$APP_BUNDLE_ID" 2>/dev/null || true
    sleep 2
    launch_result=$(xcrun simctl launch "$SIMULATOR_UDID" "$APP_BUNDLE_ID" 2>&1 || true)
    sleep "$APP_SETTLE_TIME"

    if echo "$launch_result" | grep -q "$APP_BUNDLE_ID"; then
        _setup_ok "iOS app launched and in foreground"
        return 0
    fi

    _setup_failed "Could not launch iOS app"
    return 1
}

# ── 4. Wait for CDP Hermes Target ───────────────────────────────────

_check_cdp_target() {
    local elapsed=0
    local json
    local relaunched=false

    while [ $elapsed -lt $CDP_TIMEOUT ]; do
        json=$(curl -s "$CDP_DISCOVERY_URL" 2>/dev/null || echo "[]")
        if echo "$json" | grep -q '"webSocketDebuggerUrl"'; then
            _SETUP_CDP_WS_URL=$(echo "$json" | node -e "
                let d='';process.stdin.on('data',c=>d+=c);
                process.stdin.on('end',()=>{
                    try{
                        const targets=JSON.parse(d);
                        const hermes=targets.find(t=>t.description && t.description.includes('Bridgeless'));
                        console.log(hermes?hermes.webSocketDebuggerUrl:targets[0].webSocketDebuggerUrl);
                    }catch(e){console.log('');}
                });
            " 2>/dev/null || echo "")

            if [ -n "$_SETUP_CDP_WS_URL" ]; then
                export CDP_WS_URL="$_SETUP_CDP_WS_URL"
                _setup_ok "CDP Hermes target available"
                return 0
            fi
        fi

        # If no CDP target after 10s, try relaunching the app
        if [ $elapsed -ge 10 ] && [ "$relaunched" = false ]; then
            _setup_fixing "No CDP target — relaunching app..."
            if qa_is_android; then
                adb_bin=$(_android_adb_bin 2>/dev/null || echo "")
                if [ -n "$adb_bin" ]; then
                    "$adb_bin" -s "$ANDROID_SERIAL" shell am force-stop "$APP_BUNDLE_ID" 2>/dev/null || true
                    sleep 2
                    "$adb_bin" -s "$ANDROID_SERIAL" shell monkey -p "$APP_BUNDLE_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
                fi
            else
                xcrun simctl terminate "$SIMULATOR_UDID" "$APP_BUNDLE_ID" 2>/dev/null || true
                sleep 2
                xcrun simctl launch "$SIMULATOR_UDID" "$APP_BUNDLE_ID" 2>/dev/null || true
            fi
            relaunched=true
            sleep "$APP_SETTLE_TIME"
        fi

        sleep 2
        elapsed=$((elapsed + 2))
    done

    _setup_failed "No CDP target found within ${CDP_TIMEOUT}s"
    return 1
}

# ── 5. Validate CDP Connection ───────────────────────────────────────

_check_cdp_connection() {
    local ws_url="${_SETUP_CDP_WS_URL:-${CDP_WS_URL:-}}"
    if [ -z "$ws_url" ] || [ "$ws_url" = "auto" ]; then
        _setup_failed "No CDP WebSocket URL available"
        return 1
    fi

    local attempt=0
    local max_attempts=3

    while [ $attempt -lt $max_attempts ]; do
        local result
        result=$(cd "$PROJECT_DIR" && node -e "
            const WebSocket=require('ws');
            const ws=new WebSocket('$ws_url');
            ws.on('open',()=>{
                ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'1+1',returnByValue:true}}));
            });
            ws.on('message',d=>{
                const m=JSON.parse(d);
                if(m.id===1){
                    const v=m.result?.result?.value;
                    console.log(v===2?'ok':'fail');
                    ws.close();process.exit(0);
                }
            });
            ws.on('error',e=>{console.log('error');process.exit(1)});
            setTimeout(()=>{console.log('timeout');process.exit(1)},5000);
        " 2>/dev/null || echo "error")

        if [ "$result" = "ok" ]; then
            _setup_ok "CDP connection functional (eval 1+1=2)"
            return 0
        fi

        attempt=$((attempt + 1))
        sleep 1
    done

    _setup_failed "CDP connection failed after $max_attempts attempts"
    return 1
}

# ── 6. Validate Navigation Module ID ────────────────────────────────

_check_nav_module() {
    local ws_url="${_SETUP_CDP_WS_URL:-${CDP_WS_URL:-}}"
    if [ -z "$ws_url" ] || [ "$ws_url" = "auto" ]; then
        _setup_failed "No CDP URL for nav module check"
        return 1
    fi

    local attempt=0
    local max_attempts=3
    local result=""

    while [ $attempt -lt $max_attempts ]; do
        result=$(cd "$PROJECT_DIR" && node -e "
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
                if(m.id===1){console.log(m.result?.result?.value||'error');ws.close();process.exit(0);}
            });
            ws.on('error',()=>{console.log('error');process.exit(1)});
            setTimeout(()=>{console.log('timeout');process.exit(1)},10000);
        " 2>/dev/null || echo '{"error":"node failed"}')

        local module_id
        module_id=$(echo "$result" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const o=JSON.parse(d);console.log(o.moduleId||'')}catch(e){console.log('')}})" 2>/dev/null || echo "")

        if [ -n "$module_id" ]; then
            echo "$module_id" > "$NAV_MODULE_CACHE"
            _setup_ok "Navigation module ID: $module_id"
            export NAV_MODULE_ID="$module_id"
            return 0
        fi

        attempt=$((attempt + 1))
        if [ $attempt -lt $max_attempts ]; then
            sleep $((attempt * 3))
        fi
    done

    _setup_failed "Navigation module not found after $max_attempts attempts"
    return 1
}

# ── 7. Dismiss LogBox Error Overlay ──────────────────────────────────

_dismiss_logbox() {
    local ws_url="${_SETUP_CDP_WS_URL:-${CDP_WS_URL:-}}"
    if [ -z "$ws_url" ] || [ "$ws_url" = "auto" ]; then
        _setup_ok "LogBox check skipped (no CDP URL)"
        return 0
    fi

    local result
    result=$(cd "$PROJECT_DIR" && node -e "
        const WebSocket=require('ws');
        const ws=new WebSocket('$ws_url');
        ws.on('open',()=>{
            ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{
                expression:\`
                    (function(){
                        try{
                            var LogBox=require('react-native/Libraries/LogBox/LogBox');
                            if(LogBox&&LogBox.ignoreAllLogs) LogBox.ignoreAllLogs(true);
                            var LogBoxData=require('react-native/Libraries/LogBox/Data/LogBoxData');
                            if(LogBoxData&&LogBoxData.clear) LogBoxData.clear();
                            return 'suppressed';
                        }catch(e){
                            return 'no-logbox: '+e.message;
                        }
                    })();
                \`,
                returnByValue:true
            }}));
        });
        ws.on('message',d=>{
            const m=JSON.parse(d);
            if(m.id===1){console.log(m.result?.result?.value||'unknown');ws.close();process.exit(0);}
        });
        ws.on('error',()=>{console.log('error');process.exit(1)});
        setTimeout(()=>{console.log('timeout');process.exit(1)},5000);
    " 2>/dev/null || echo "error")

    if [ "$result" = "suppressed" ]; then
        _setup_ok "LogBox suppressed for session"
    else
        _setup_ok "LogBox suppress attempted (result: $result)"
    fi

    return 0
}

# ── Main: Run All Checks ────────────────────────────────────────────

run_setup_guard() {
    if [ "$_SETUP_GUARD_RAN" = true ]; then
        return 0
    fi

    echo ""
    echo "┌─────────────────────────────────────────────┐"
    printf "│  SETUP GUARD — Checking %-8s prerequisites... │\n" "${QA_PLATFORM:-ios}"
    echo "└─────────────────────────────────────────────┘"
    echo ""

    local failed=0

    _check_simulator       || failed=$((failed + 1))
    _check_dev_server      || failed=$((failed + 1))
    _check_app_foreground  || failed=$((failed + 1))
    _check_cdp_target      || failed=$((failed + 1))
    _check_cdp_connection  || failed=$((failed + 1))
    _check_nav_module      || failed=$((failed + 1))
    _dismiss_logbox        || true  # Non-critical

    echo ""
    if [ $failed -gt 0 ]; then
        echo "  SETUP GUARD: $failed critical check(s) failed. Aborting."
        echo ""
        return 1
    fi

    echo "  SETUP GUARD: All checks passed. Ready to test."
    echo ""

    _SETUP_GUARD_RAN=true
    return 0
}

# ── Export ────────────────────────────────────────────────────────────

export -f run_setup_guard 2>/dev/null || true
export VIDEO_MODULE_CACHE NAV_MODULE_CACHE 2>/dev/null || true
