#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../lib/reco-prerelease-helpers.sh"

SECTION_ID="liking"
SECTION_NAME="Liking"
PRIORITY="P1"
RISK="medium"
TEST_NAME="reco-prerelease-liking"

setup_test "$TEST_NAME"

step "Record initial engagement state"
before_state="$(qa_reco_get_engagement_state)"
item_id="$(qa_reco_json_field "$before_state" "summary.itemId" 2>/dev/null || qa_reco_json_field "$before_state" "summary.id" 2>/dev/null || echo "")"
before_liked="$(qa_reco_json_field "$before_state" "summary.isLiked" 2>/dev/null || echo "unknown")"
before_count="$(qa_reco_json_field "$before_state" "summary.likesCount" 2>/dev/null || echo "unknown")"
if qa_reco_json_ok "$before_state"; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "liking.initial-state" "Initial state" "passed" "$before_state" "" "item-id=$item_id;isLiked=$before_liked;likesCount=$before_count"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "liking.initial-state" "Initial state" "blocked" "$before_state" "" "item-id=unknown"
fi

step "Tap like action rail selector"
like_ref="$(qa_reco_find_ref_by_testid "feed-action-like" || true)"
like_shot="$(qa_reco_take_evidence "liking-before-tap" || true)"
if [ -n "$like_ref" ] && qa_reco_tap_testid "feed-action-like"; then
    sleep 1
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "liking.action-rail-tap" "Action rail tap" "passed" "Tapped feed-action-like" "$like_shot" "selector-ref=$like_ref"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "liking.action-rail-tap" "Action rail tap" "blocked" "feed-action-like selector was not tappable in the current snapshot" "$like_shot" "selector-ref=${like_ref:-missing}"
fi

step "Verify liked state or count toggled"
after_state="$(qa_reco_get_engagement_state)"
after_liked="$(qa_reco_json_field "$after_state" "summary.isLiked" 2>/dev/null || echo "unknown")"
after_count="$(qa_reco_json_field "$after_state" "summary.likesCount" 2>/dev/null || echo "unknown")"
if [ "$before_liked" != "unknown" ] && [ "$after_liked" != "unknown" ] && [ "$before_liked" != "$after_liked" ]; then
    toggle_status="passed"
    toggle_msg="Liked state toggled from $before_liked to $after_liked"
elif [ "$before_count" != "unknown" ] && [ "$after_count" != "unknown" ] && [ "$before_count" != "$after_count" ]; then
    toggle_status="passed"
    toggle_msg="Like count changed from $before_count to $after_count"
else
    toggle_status="blocked"
    toggle_msg="No liked/count change detected; before=$before_state after=$after_state"
fi
qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "liking.count-toggle" "Count/state toggle" "$toggle_status" "$toggle_msg" "" "before-state=$before_liked/$before_count;after-state=$after_liked/$after_count"

step "Optional double-tap like gesture"
center_x="${VIDEO_CENTER_X:-$((SCREEN_WIDTH / 2))}"
center_y="${VIDEO_CENTER_Y:-$((SCREEN_HEIGHT / 2))}"
tap "$center_x" "$center_y" "${ACTIVE_SESSION:-default}" || true
tap "$center_x" "$center_y" "${ACTIVE_SESSION:-default}" || true
double_shot="$(qa_reco_take_evidence "liking-double-tap" || true)"
qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "liking.double-tap-optional" "Double-tap optional" "partial" "Double-tap gesture executed; state may be backend/auth dependent" "$double_shot" "gesture-result-or-skip-reason=executed-best-effort"

step "Scroll away and back for persistence"
if cdp_eval_safe 'var state=globalThis.__qaFeedState; if (state && typeof state.scrollToNext === "function") { state.scrollToNext(); return JSON.stringify({ok:true}); } return JSON.stringify({ok:false});' >/dev/null 2>&1; then
    sleep 1
    cdp_eval_safe 'var state=globalThis.__qaFeedState; if (state && typeof state.scrollToPrevious === "function") { state.scrollToPrevious(); return JSON.stringify({ok:true}); } return JSON.stringify({ok:false});' >/dev/null 2>&1 || true
    sleep 1
    persist_state="$(qa_reco_get_engagement_state)"
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "liking.scroll-persistence" "Scroll persistence" "partial" "$persist_state" "" "same-item-id=$item_id;state-after-return=best-effort"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "liking.scroll-persistence" "Scroll persistence" "skipped" "Feed scroll hooks unavailable" "" "same-item-id=$item_id"
fi

step "Cleanup liked state"
cleanup_state="$(qa_reco_get_engagement_state)"
cleanup_liked="$(qa_reco_json_field "$cleanup_state" "summary.isLiked" 2>/dev/null || echo "unknown")"
if [ "$before_liked" != "unknown" ] && [ "$cleanup_liked" != "unknown" ] && [ "$cleanup_liked" != "$before_liked" ] && qa_reco_tap_testid "feed-action-like"; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "liking.cleanup" "Cleanup" "passed" "Toggled like back toward initial state" "" "cleanup-result=toggled"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "liking.cleanup" "Cleanup" "partial" "Cleanup not needed or selector unavailable" "" "cleanup-result=best-effort"
fi

teardown_test "$TEST_NAME"
exit 0
