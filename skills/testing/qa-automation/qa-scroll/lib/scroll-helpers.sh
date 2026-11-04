#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  scroll-helpers.sh — Video/Media State & Feed Interaction         ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  Source this file in scroll test scripts:                         ║
# ║    source "$(dirname "$0")/../lib/scroll-helpers.sh"              ║
# ║                                                                   ║
# ║  Provides:                                                        ║
# ║    • Debug hook installation (patches video player prototype)     ║
# ║    • Video state queries (playing, muted, currentTime)            ║
# ║    • Mute/unmute toggle via CDP                                   ║
# ║    • Feed scrolling (CDP hook or agent-device swipe fallback)    ║
# ║    • Error overlay detection and dismissal                        ║
# ║    • Assertion helpers for video state                            ║
# ╚═══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Source shared helpers ────────────────────────────────────────────
SCROLL_SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QA_ROOT_SCR="$(cd "$SCROLL_SKILL_DIR/../.." && pwd 2>/dev/null || cd "$SCROLL_SKILL_DIR/.." && pwd)"

source "$SCROLL_SKILL_DIR/lib/setup-guard.sh"
source "$QA_ROOT_SCR/qa-test-flows/lib/test-helpers.sh"
source "$QA_ROOT_SCR/qa-test-flows/lib/cdp-helpers.sh"

# ── Swipe Coordinates (configurable) ────────────────────────────────
# Center-ish coordinates for swipe gestures. Override in qa.config.sh.
SWIPE_START_X="${SWIPE_START_X:-$((SCREEN_WIDTH / 2))}"
SWIPE_START_Y="${SWIPE_START_Y:-$((SCREEN_HEIGHT * 2 / 3))}"
SWIPE_END_X="${SWIPE_END_X:-$((SCREEN_WIDTH / 2))}"
SWIPE_END_Y="${SWIPE_END_Y:-$((SCREEN_HEIGHT / 4))}"
VIDEO_CENTER_X="${VIDEO_CENTER_X:-$((SCREEN_WIDTH / 2))}"
VIDEO_CENTER_Y="${VIDEO_CENTER_Y:-$((SCREEN_HEIGHT / 2))}"

# ── Install Debug Hook ───────────────────────────────────────────────
# Patches VideoPlayer.prototype to track all player instances.
# Works by finding the VideoPlayer class in Metro modules, then patching
# play() and replaceAsync() to capture references.
install_debug_hook() {
    cdp_eval_safe "
        // Find the VideoPlayer class
        var VideoPlayerClass = null;
        for (var i = ${MODULE_SCAN_START}; i < ${MODULE_SCAN_END}; i++) {
            try {
                var m = __r(i);
                if (m && m.default && m.default.${VIDEO_PLAYER_CLASS} && typeof m.default.${VIDEO_PLAYER_CLASS} === 'function') {
                    VideoPlayerClass = m.default.${VIDEO_PLAYER_CLASS};
                    break;
                }
                if (m && m.${VIDEO_PLAYER_CLASS} && typeof m.${VIDEO_PLAYER_CLASS} === 'function') {
                    VideoPlayerClass = m.${VIDEO_PLAYER_CLASS};
                    break;
                }
            } catch(e) {}
        }

        if (!VideoPlayerClass) {
            return JSON.stringify({error: '${VIDEO_PLAYER_CLASS} class not found'});
        }

        // Set up global tracking array
        if (!globalThis.${GLOBAL_PLAYERS_VAR}) {
            globalThis.${GLOBAL_PLAYERS_VAR} = [];
        }

        // Patch prototype methods to capture instances
        if (!VideoPlayerClass.prototype.__qaPatched) {
            var origPlay = VideoPlayerClass.prototype.play;
            VideoPlayerClass.prototype.play = function() {
                var found = false;
                for (var k = 0; k < globalThis.${GLOBAL_PLAYERS_VAR}.length; k++) {
                    if (globalThis.${GLOBAL_PLAYERS_VAR}[k] === this) { found = true; break; }
                }
                if (!found) {
                    globalThis.${GLOBAL_PLAYERS_VAR}.push(this);
                    if (globalThis.${GLOBAL_PLAYERS_VAR}.length > ${MAX_TRACKED_PLAYERS}) {
                        globalThis.${GLOBAL_PLAYERS_VAR} = globalThis.${GLOBAL_PLAYERS_VAR}.slice(-${MAX_TRACKED_PLAYERS});
                    }
                }
                return origPlay.apply(this, arguments);
            };

            if (VideoPlayerClass.prototype.replaceAsync) {
                var origReplaceAsync = VideoPlayerClass.prototype.replaceAsync;
                VideoPlayerClass.prototype.replaceAsync = function() {
                    var found2 = false;
                    for (var k2 = 0; k2 < globalThis.${GLOBAL_PLAYERS_VAR}.length; k2++) {
                        if (globalThis.${GLOBAL_PLAYERS_VAR}[k2] === this) { found2 = true; break; }
                    }
                    if (!found2) {
                        globalThis.${GLOBAL_PLAYERS_VAR}.push(this);
                    }
                    return origReplaceAsync.apply(this, arguments);
                };
            }

            VideoPlayerClass.prototype.__qaPatched = true;
        }

        // Debug accessor function
        globalThis.__qaDebugPlayers = function() {
            var players = globalThis.${GLOBAL_PLAYERS_VAR} || [];
            var activePlayers = [];
            for (var i = 0; i < players.length; i++) {
                try {
                    var p = players[i];
                    activePlayers.push({
                        index: i,
                        playing: !!p.playing,
                        muted: !!p.muted,
                        currentTime: p.currentTime || 0,
                        duration: p.duration || 0,
                        status: p.status || 'unknown'
                    });
                } catch(e) {
                    activePlayers.push({index: i, error: e.message});
                }
            }

            var currentPlayer = null;
            for (var j = activePlayers.length - 1; j >= 0; j--) {
                if (activePlayers[j].playing) {
                    currentPlayer = activePlayers[j];
                    break;
                }
            }

            return {
                totalPlayers: activePlayers.length,
                currentPlayer: currentPlayer,
                allPlayers: activePlayers
            };
        };

        return JSON.stringify({
            ok: true,
            playersTracked: globalThis.${GLOBAL_PLAYERS_VAR}.length
        });
    "
}

# ── Query Video State ────────────────────────────────────────────────

# Query the current playing video state.
# Returns JSON: {playing, muted, currentTime, playerIndex}
query_video_playing() {
    local attempt=0
    local max_attempts=3
    local result=""

    while [ $attempt -lt $max_attempts ]; do
        result=$(cdp_eval "
            (function() {
                try {
                    if (globalThis.${GLOBAL_PLAYERS_VAR} && globalThis.${GLOBAL_PLAYERS_VAR}.length > 0) {
                        var players = globalThis.${GLOBAL_PLAYERS_VAR};
                        for (var i = players.length - 1; i >= 0; i--) {
                            try {
                                if (players[i].playing) {
                                    return JSON.stringify({
                                        playing: true,
                                        muted: !!players[i].muted,
                                        currentTime: players[i].currentTime || 0,
                                        playerIndex: i
                                    });
                                }
                            } catch(e) {}
                        }
                        return JSON.stringify({playing: false, muted: false, currentTime: 0, reason: 'no playing player'});
                    }
                    return JSON.stringify({playing: false, error: 'no tracked players'});
                } catch(e) {
                    return JSON.stringify({error: e.message, playing: false});
                }
            })();
        " 2>/dev/null || echo '{"error":"cdp failed","playing":false}')

        local has_playing
        has_playing=$(echo "$result" | node -e "
            let d='';process.stdin.on('data',c=>d+=c);
            process.stdin.on('end',()=>{try{const o=JSON.parse(d);console.log(o.error?'no':'yes')}catch(e){console.log('no')}});
        " 2>/dev/null || echo "no")

        if [ "$has_playing" = "yes" ]; then
            echo "$result"
            return 0
        fi

        attempt=$((attempt + 1))
        [ $attempt -lt $max_attempts ] && sleep 1
    done

    echo "$result"
}

# Check if video currentTime is advancing.
# Returns: "advancing" or "stalled"
check_video_progress() {
    local time1
    local time2

    time1=$(cdp_eval "
        (function() {
            if (!globalThis.${GLOBAL_PLAYERS_VAR}) return '0';
            var players = globalThis.${GLOBAL_PLAYERS_VAR};
            for (var i = players.length - 1; i >= 0; i--) {
                try { if (players[i].playing) return '' + players[i].currentTime; } catch(e) {}
            }
            return '0';
        })();
    " 2>/dev/null || echo "0")

    sleep 2

    time2=$(cdp_eval "
        (function() {
            if (!globalThis.${GLOBAL_PLAYERS_VAR}) return '0';
            var players = globalThis.${GLOBAL_PLAYERS_VAR};
            for (var i = players.length - 1; i >= 0; i--) {
                try { if (players[i].playing) return '' + players[i].currentTime; } catch(e) {}
            }
            return '0';
        })();
    " 2>/dev/null || echo "0")

    local result
    result=$(node -e "
        var t1 = parseFloat('$time1') || 0;
        var t2 = parseFloat('$time2') || 0;
        console.log(t2 > t1 ? 'advancing' : 'stalled');
    " 2>/dev/null || echo "stalled")
    echo "$result"
}

# ── Mute Control ─────────────────────────────────────────────────────

# Returns: "muted", "unmuted", or "unknown"
get_mute_state() {
    local result
    result=$(cdp_eval "
        (function() {
            if (!globalThis.${GLOBAL_PLAYERS_VAR}) return 'unknown';
            var players = globalThis.${GLOBAL_PLAYERS_VAR};
            for (var i = players.length - 1; i >= 0; i--) {
                try {
                    if (players[i].playing) return players[i].muted ? 'muted' : 'unmuted';
                } catch(e) {}
            }
            if (players.length > 0) {
                try { return players[players.length-1].muted ? 'muted' : 'unmuted'; } catch(e) {}
            }
            return 'unknown';
        })();
    " 2>/dev/null || echo "unknown")
    echo "$result"
}

# Toggle mute via CDP (deterministic, no coordinate tap).
# Returns: "muted" or "unmuted" (the new state)
toggle_mute_cdp() {
    local result
    result=$(cdp_eval "
        (function() {
            if (!globalThis.${GLOBAL_PLAYERS_VAR} || globalThis.${GLOBAL_PLAYERS_VAR}.length === 0) return 'unknown';
            var players = globalThis.${GLOBAL_PLAYERS_VAR};
            var target = null;
            for (var i = players.length - 1; i >= 0; i--) {
                try { if (players[i].playing) { target = players[i]; break; } } catch(e) {}
            }
            if (!target && players.length > 0) target = players[players.length - 1];
            if (!target) return 'unknown';
            try {
                target.muted = !target.muted;
                return target.muted ? 'muted' : 'unmuted';
            } catch(e) { return 'error: ' + e.message; }
        })();
    " 2>/dev/null || echo "unknown")
    echo "$result"
}

# ── Feed Interaction ─────────────────────────────────────────────────

# Scroll to next video via CDP hook or agent-device swipe fallback.
scroll_to_next_video() {
    step "Scrolling to next video"

    # Try CDP hook first
    local result
    result=$(cdp_eval "
        (function() {
            if (globalThis.${GLOBAL_FEED_VAR} && globalThis.${GLOBAL_FEED_VAR}.scrollToNext) {
                var before = globalThis.${GLOBAL_FEED_VAR}.currentIndex;
                globalThis.${GLOBAL_FEED_VAR}.scrollToNext();
                return JSON.stringify({ok:true, before:before, after:globalThis.${GLOBAL_FEED_VAR}.currentIndex});
            }
            return JSON.stringify({error:'feed hook not available'});
        })();
    " 2>/dev/null || echo '{"error":"cdp failed"}')

    local has_ok
    has_ok=$(echo "$result" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{try{console.log(JSON.parse(d).ok?'yes':'no')}catch(e){console.log('no')}});
    " 2>/dev/null || echo "no")

    if [ "$has_ok" = "yes" ]; then
        log_info "Scroll result: $result"
    else
        # Fallback: agent-device swipe up
        log_info "CDP scroll hook not available — using swipe gesture"
        swipe $SWIPE_START_X $SWIPE_START_Y $SWIPE_END_X $SWIPE_END_Y
    fi

    sleep 3
}

# Tap center of video (fallback interaction)
tap_video_center() {
    tap "$VIDEO_CENTER_X" "$VIDEO_CENTER_Y"
    sleep 1
}

# ── Error Overlay Detection ──────────────────────────────────────────

# Returns: "visible" or "clear"
check_error_overlay() {
    local result
    result=$(cdp_eval "
        (function() {
            try {
                var LogBoxData = require('react-native/Libraries/LogBox/Data/LogBoxData');
                if (LogBoxData) {
                    var errors = LogBoxData.errors && LogBoxData.errors();
                    var warnings = LogBoxData.warnings && LogBoxData.warnings();
                    var hasErrors = (errors && errors.length > 0) || (warnings && warnings.length > 0);
                    return hasErrors ? 'visible' : 'clear';
                }
                return 'clear';
            } catch(e) { return 'clear'; }
        })();
    " 2>/dev/null || echo "clear")
    echo "$result"
}

# Dismiss the error overlay via CDP
dismiss_error_overlay() {
    cdp_eval "
        (function() {
            try {
                var LogBox = require('react-native/Libraries/LogBox/LogBox');
                if (LogBox && LogBox.ignoreAllLogs) LogBox.ignoreAllLogs(true);
                var LogBoxData = require('react-native/Libraries/LogBox/Data/LogBoxData');
                if (LogBoxData && LogBoxData.clear) LogBoxData.clear();
                return 'cleared';
            } catch(e) { return 'cdp-only: ' + e.message; }
        })();
    " >/dev/null 2>&1
    sleep 0.5
}

# ── Assertion Helpers ────────────────────────────────────────────────

assert_video_playing() {
    local state
    state=$(query_video_playing)
    local playing
    playing=$(echo "$state" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{try{console.log(JSON.parse(d).playing?'true':'false')}catch(e){console.log('false')}});
    " 2>/dev/null || echo "false")

    if [ "$playing" = "true" ]; then
        log_pass "Video is playing"
        return 0
    else
        log_fail "Video is NOT playing (state: $state)"
        return 1
    fi
}

assert_video_progressing() {
    local progress
    progress=$(check_video_progress)
    if [ "$progress" = "advancing" ]; then
        log_pass "Video playback is progressing"
        return 0
    else
        log_fail "Video playback is stalled"
        return 1
    fi
}

assert_video_muted() {
    local state
    state=$(get_mute_state)
    if [ "$state" = "muted" ]; then
        log_pass "Video is muted"
        return 0
    else
        log_fail "Video is NOT muted (state: $state)"
        return 1
    fi
}

assert_video_unmuted() {
    local state
    state=$(get_mute_state)
    if [ "$state" = "unmuted" ]; then
        log_pass "Video is unmuted"
        return 0
    else
        log_fail "Video is NOT unmuted (state: $state)"
        return 1
    fi
}

echo "Scroll QA helpers loaded."
