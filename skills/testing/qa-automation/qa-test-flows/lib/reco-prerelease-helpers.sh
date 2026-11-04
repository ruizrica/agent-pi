#!/bin/bash
# Shared helpers for QA Reco pre-release flows.
# Source from flows/reco-prerelease/*.sh after test-helpers/cdp helpers are available.

set -euo pipefail

RECO_HELPERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QA_TEST_FLOWS_ROOT="$(cd "$RECO_HELPERS_DIR/.." && pwd)"
QA_AUTOMATION_ROOT="$(cd "$QA_TEST_FLOWS_ROOT/.." && pwd)"

# Source shared helpers only when callers have not already done so.
if ! declare -F setup_test >/dev/null 2>&1; then
    source "$QA_TEST_FLOWS_ROOT/lib/test-helpers.sh"
fi
if ! declare -F cdp_eval_safe >/dev/null 2>&1; then
    source "$QA_TEST_FLOWS_ROOT/lib/cdp-helpers.sh"
fi

# Optional helpers are sourced when present. They provide scroll gestures and
# state-persistence patterns without making this helper layer depend on them.
if [ -f "$QA_AUTOMATION_ROOT/qa-scroll/lib/scroll-helpers.sh" ] && ! declare -F scroll_to_next_video >/dev/null 2>&1; then
    # shellcheck source=/dev/null
    source "$QA_AUTOMATION_ROOT/qa-scroll/lib/scroll-helpers.sh" || true
fi
if [ -f "$QA_AUTOMATION_ROOT/qa-state-persistence/lib/state-helpers.sh" ]; then
    # shellcheck source=/dev/null
    source "$QA_AUTOMATION_ROOT/qa-state-persistence/lib/state-helpers.sh" || true
fi

QA_RECO_RESULTS_DIR="${TEST_OUTPUT_DIR:-/tmp/qa-tests/${QA_PLATFORM:-ios}}/reco-prerelease"
QA_RECO_CHECKS_FILE="$QA_RECO_RESULTS_DIR/checks.jsonl"
mkdir -p "$QA_RECO_RESULTS_DIR"

qa_reco_json_escape() {
    node -e 'process.stdout.write(JSON.stringify(process.argv[1] || ""))' "$1"
}

qa_reco_record_check() {
    local section_id="$1"
    local section_name="$2"
    local priority="$3"
    local risk="$4"
    local check_id="$5"
    local check_name="$6"
    local status="$7"
    local message="${8:-}"
    local screenshots="${9:-}"
    local evidence="${10:-}"
    local platform="${QA_PLATFORM:-ios}"
    local ts
    ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

    mkdir -p "$QA_RECO_RESULTS_DIR"
    printf '{"timestamp":%s,"platform":%s,"sectionId":%s,"sectionName":%s,"priority":%s,"risk":%s,"id":%s,"name":%s,"status":%s,"message":%s,"screenshots":%s,"evidence":%s}\n' \
        "$(qa_reco_json_escape "$ts")" \
        "$(qa_reco_json_escape "$platform")" \
        "$(qa_reco_json_escape "$section_id")" \
        "$(qa_reco_json_escape "$section_name")" \
        "$(qa_reco_json_escape "$priority")" \
        "$(qa_reco_json_escape "$risk")" \
        "$(qa_reco_json_escape "$check_id")" \
        "$(qa_reco_json_escape "$check_name")" \
        "$(qa_reco_json_escape "$status")" \
        "$(qa_reco_json_escape "$message")" \
        "$(node -e 'const v=process.argv[1]||""; process.stdout.write(JSON.stringify(v ? v.split(",").filter(Boolean) : []))' "$screenshots")" \
        "$(node -e 'const v=process.argv[1]||""; process.stdout.write(JSON.stringify(v ? v.split(";").filter(Boolean).map(x=>{const i=x.indexOf("="); return i>=0 ? {label:x.slice(0,i), value:x.slice(i+1)} : {label:x};}) : []))' "$evidence")" \
        >> "$QA_RECO_CHECKS_FILE"

    case "$status" in
        passed) log_pass "$check_name" ;;
        failed) log_fail "$check_name — $message" ;;
        blocked) log_warn "BLOCKED: $check_name — $message" ;;
        partial) log_warn "PARTIAL: $check_name — $message" ;;
        skipped) log_warn "SKIPPED: $check_name — $message" ;;
        *) log_warn "$check_name — $status — $message" ;;
    esac
}

qa_reco_take_evidence() {
    local name="$1"
    local safe_name
    safe_name="$(echo "$name" | tr -cs 'A-Za-z0-9._-' '-')"
    take_screenshot "$safe_name" 2>/dev/null || true
}

qa_reco_nav_feed() {
    local output
    output=$(cdp_eval_safe '
        if (globalThis.__qaFeedState && typeof globalThis.__qaFeedState.navigateFeed === "function") {
            return JSON.stringify(globalThis.__qaFeedState.navigateFeed());
        }
        return JSON.stringify({ ok: false, reason: "__qaFeedState.navigateFeed unavailable" });
    ' 2>/dev/null || echo '{"ok":false,"reason":"cdp navigation failed"}')
    echo "$output"
}

qa_reco_get_feed_state() {
    cdp_eval_safe '
        var state = globalThis.__qaFeedState;
        if (!state) return JSON.stringify({ ok: false, reason: "__qaFeedState unavailable" });
        var summary = typeof state.getVisibleSummary === "function" ? state.getVisibleSummary() : state;
        return JSON.stringify({ ok: true, summary: summary });
    ' 2>/dev/null || echo '{"ok":false,"reason":"cdp feed state failed"}'
}

qa_reco_get_engagement_state() {
    cdp_eval_safe '
        var state = globalThis.__qaEngagementState;
        if (!state) return JSON.stringify({ ok: false, reason: "__qaEngagementState unavailable" });
        var summary = typeof state.getState === "function" ? state.getState() : state;
        return JSON.stringify({ ok: true, summary: summary });
    ' 2>/dev/null || echo '{"ok":false,"reason":"cdp engagement state failed"}'
}

qa_reco_find_ref_by_testid() {
    local testid="$1"
    local snapshot_file="$QA_RECO_RESULTS_DIR/snapshot-${testid}.txt"
    agent-device snapshot --session "${ACTIVE_SESSION:-default}" -i > "$snapshot_file" 2>/dev/null || true
    if grep -q "$testid" "$snapshot_file" 2>/dev/null; then
        echo "$snapshot_file"
        return 0
    fi
    echo ""
    return 1
}

qa_reco_tap_testid() {
    local testid="$1"
    local ref_file
    ref_file="$(qa_reco_find_ref_by_testid "$testid" || true)"
    if [ -z "$ref_file" ]; then
        return 1
    fi
    # agent-device does not guarantee testID direct tapping across platforms, so
    # callers should treat this as best-effort and verify state after the action.
    agent-device click "$testid" --session "${ACTIVE_SESSION:-default}" 2>/dev/null || return 1
}

qa_reco_fill_testid() {
    local testid="$1"
    local text="$2"
    local ref_file
    ref_file="$(qa_reco_find_ref_by_testid "$testid" || true)"
    if [ -z "$ref_file" ]; then
        return 1
    fi
    agent-device fill "$testid" "$text" --session "${ACTIVE_SESSION:-default}" 2>/dev/null || return 1
}

qa_reco_wait_for_check() {
    local label="$1"
    local attempts="${2:-5}"
    local delay="${3:-1}"
    local i=1
    while [ "$i" -le "$attempts" ]; do
        log_info "Waiting for $label ($i/$attempts)"
        sleep "$delay"
        i=$((i + 1))
    done
}

qa_reco_json_field() {
    local json="$1"
    local field="$2"
    node -e 'try { const obj=JSON.parse(process.argv[1]); const path=process.argv[2].split("."); let v=obj; for (const p of path) v=v?.[p]; if (v === undefined || v === null) process.exit(1); process.stdout.write(String(v)); } catch { process.exit(1); }' "$json" "$field"
}

qa_reco_json_ok() {
    local json="$1"
    node -e 'try { const obj=JSON.parse(process.argv[1]); process.exit(obj && obj.ok !== false ? 0 : 1); } catch { process.exit(1); }' "$json"
}
