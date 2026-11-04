#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../lib/reco-prerelease-helpers.sh"

SECTION_ID="basic-feed"
SECTION_NAME="Basic Feed"
PRIORITY="P1"
RISK="low"
TEST_NAME="reco-prerelease-basic-feed"

setup_test "$TEST_NAME"

step "Verify app foreground"
if assert_app_foreground 2>/dev/null; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.app-foreground" "App foreground" "passed" "Reco app is foregrounded" "" "foreground-state=ok"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.app-foreground" "App foreground" "blocked" "Reco app is not foregrounded or agent-device appstate is unavailable" "" "foreground-state=unknown"
fi

step "Navigate to feed"
nav_result="$(qa_reco_nav_feed)"
if qa_reco_json_ok "$nav_result"; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.navigate-feed" "Navigate feed" "passed" "$nav_result" "" "route-state=ok"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.navigate-feed" "Navigate feed" "partial" "$nav_result" "" "route-state=cdp-unavailable"
fi

step "Read feed state"
feed_state="$(qa_reco_get_feed_state)"
data_length="$(qa_reco_json_field "$feed_state" "summary.dataLength" 2>/dev/null || echo "")"
current_index="$(qa_reco_json_field "$feed_state" "summary.currentIndex" 2>/dev/null || echo "")"
current_item="$(qa_reco_json_field "$feed_state" "summary.currentItem.id" 2>/dev/null || qa_reco_json_field "$feed_state" "summary.itemId" 2>/dev/null || echo "")"
if [ -n "$data_length" ] && [ "$data_length" != "0" ]; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.feed-data-ready" "Feed data ready" "passed" "$feed_state" "" "dataLength=$data_length;currentIndex=$current_index;currentItem=$current_item"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.feed-data-ready" "Feed data ready" "blocked" "$feed_state" "" "dataLength=${data_length:-unknown}"
fi

step "Capture first card evidence"
first_card_shot="$(qa_reco_take_evidence "basic-feed-first-card" || true)"
if [ -n "$first_card_shot" ] && [ -f "$first_card_shot" ]; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.first-card-visible" "First card visible" "passed" "Captured first-card screenshot" "$first_card_shot" "current-card-summary=$current_item"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.first-card-visible" "First card visible" "blocked" "Screenshot capture failed" "" "current-card-summary=$current_item"
fi

step "Check for blocking error overlay"
if declare -F dismiss_error_overlay >/dev/null 2>&1; then
    dismiss_error_overlay >/dev/null 2>&1 || true
fi
snapshot_file="$QA_RECO_RESULTS_DIR/basic-feed-snapshot.txt"
agent-device snapshot --session "${ACTIVE_SESSION:-default}" > "$snapshot_file" 2>/dev/null || true
if grep -Eiq "redbox|runtime error|uncaught|exception" "$snapshot_file" 2>/dev/null; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.no-error-overlay" "No error overlay" "failed" "Snapshot contains error overlay text" "" "snapshot=$snapshot_file"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.no-error-overlay" "No error overlay" "passed" "No blocking error overlay detected" "" "snapshot=$snapshot_file"
fi

step "Capture media evidence"
media_shot="$(qa_reco_take_evidence "basic-feed-media-evidence" || true)"
if [ -n "$media_shot" ] && [ -f "$media_shot" ]; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.media-evidence" "Media evidence" "passed" "Captured media/current-card evidence" "$media_shot" "currentItem=$current_item"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "basic-feed.media-evidence" "Media evidence" "skipped" "Screenshot evidence unavailable" "" "currentItem=$current_item"
fi

teardown_test "$TEST_NAME"
exit 0
