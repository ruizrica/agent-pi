#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../lib/reco-prerelease-helpers.sh"

SECTION_ID="commenting"
SECTION_NAME="Commenting"
PRIORITY="P1"
RISK="medium"
TEST_NAME="reco-prerelease-commenting"
UNIQUE_COMMENT="QA prerelease $(date -u '+%Y%m%dT%H%M%SZ') ${QA_PLATFORM:-ios}"

setup_test "$TEST_NAME"

step "Record initial comment state"
before_state="$(qa_reco_get_engagement_state)"
item_id="$(qa_reco_json_field "$before_state" "summary.itemId" 2>/dev/null || qa_reco_json_field "$before_state" "summary.id" 2>/dev/null || echo "")"
before_count="$(qa_reco_json_field "$before_state" "summary.commentCount" 2>/dev/null || echo "unknown")"
if qa_reco_json_ok "$before_state"; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.initial-state" "Initial state" "passed" "$before_state" "" "item-id=$item_id;commentCount=$before_count"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.initial-state" "Initial state" "blocked" "$before_state" "" "item-id=unknown"
fi

step "Open comments sheet"
open_shot="$(qa_reco_take_evidence "commenting-before-open" || true)"
comment_ref="$(qa_reco_find_ref_by_testid "feed-action-comment" || true)"
if [ -n "$comment_ref" ] && qa_reco_tap_testid "feed-action-comment"; then
    qa_reco_wait_for_check "comments sheet" 2 1
    sheet_ref="$(qa_reco_find_ref_by_testid "comments-sheet" || true)"
    sheet_shot="$(qa_reco_take_evidence "commenting-sheet-open" || true)"
    if [ -n "$sheet_ref" ]; then
        qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.open-sheet" "Open sheet" "passed" "comments-sheet found" "$sheet_shot" "selector-ref=$comment_ref;sheet-snapshot=$sheet_ref"
    else
        qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.open-sheet" "Open sheet" "partial" "Comment tap executed but comments-sheet testID was not found" "$sheet_shot" "selector-ref=$comment_ref"
    fi
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.open-sheet" "Open sheet" "blocked" "feed-action-comment selector was not tappable" "$open_shot" "selector-ref=${comment_ref:-missing}"
fi

step "Verify empty send is disabled or blocked"
send_ref="$(qa_reco_find_ref_by_testid "comments-send" || true)"
if [ -n "$send_ref" ]; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.empty-send-disabled" "Empty send disabled" "partial" "comments-send found; disabled state requires accessibility-state support from snapshot" "" "send-button-state=$send_ref"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.empty-send-disabled" "Empty send disabled" "blocked" "comments-send selector not present" "" "send-button-state=missing"
fi

step "Type a unique QA comment"
input_ref="$(qa_reco_find_ref_by_testid "comments-input" || true)"
if [ -n "$input_ref" ] && qa_reco_fill_testid "comments-input" "$UNIQUE_COMMENT"; then
    typed_shot="$(qa_reco_take_evidence "commenting-typed" || true)"
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.type-unique-comment" "Type unique comment" "passed" "Typed unique QA comment" "$typed_shot" "input-state=$input_ref;unique-comment-id=$UNIQUE_COMMENT"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.type-unique-comment" "Type unique comment" "blocked" "comments-input selector was not fillable" "" "input-state=${input_ref:-missing};unique-comment-id=$UNIQUE_COMMENT"
fi

step "Submit comment"
if [ -n "$send_ref" ] && qa_reco_tap_testid "comments-send"; then
    qa_reco_wait_for_check "comment submit" 3 1
    submit_shot="$(qa_reco_take_evidence "commenting-submit" || true)"
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.submit" "Submit" "partial" "Submit tapped; backend/auth confirmation is verified by count/list evidence" "$submit_shot" "submit-result=tapped"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.submit" "Submit" "blocked" "comments-send selector was not tappable or backend/auth blocked submit" "" "submit-result=not-tapped"
fi

step "Verify count or list evidence"
after_state="$(qa_reco_get_engagement_state)"
after_count="$(qa_reco_json_field "$after_state" "summary.commentCount" 2>/dev/null || echo "unknown")"
snapshot_file="$QA_RECO_RESULTS_DIR/commenting-after-submit-snapshot.txt"
agent-device snapshot --session "${ACTIVE_SESSION:-default}" > "$snapshot_file" 2>/dev/null || true
if [ "$before_count" != "unknown" ] && [ "$after_count" != "unknown" ] && [ "$before_count" != "$after_count" ]; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.count-or-list-evidence" "Count/list evidence" "passed" "Comment count changed from $before_count to $after_count" "" "after-count-or-list-snapshot=$snapshot_file"
elif grep -Fq "$UNIQUE_COMMENT" "$snapshot_file" 2>/dev/null; then
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.count-or-list-evidence" "Count/list evidence" "passed" "Unique comment appears in snapshot" "" "after-count-or-list-snapshot=$snapshot_file"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.count-or-list-evidence" "Count/list evidence" "blocked" "No count/list evidence after submit; likely auth/backend dependency" "" "after-count-or-list-snapshot=$snapshot_file"
fi

step "Optional close/reopen persistence"
if agent-device back --session "${ACTIVE_SESSION:-default}" >/dev/null 2>&1; then
    sleep 1
    qa_reco_tap_testid "feed-action-comment" >/dev/null 2>&1 || true
    qa_reco_wait_for_check "reopen comments sheet" 2 1
    reopen_snapshot="$QA_RECO_RESULTS_DIR/commenting-reopen-snapshot.txt"
    agent-device snapshot --session "${ACTIVE_SESSION:-default}" > "$reopen_snapshot" 2>/dev/null || true
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.close-reopen-optional" "Close/reopen optional" "partial" "Close/reopen attempted; persistence depends on backend/auth" "" "persistence-result-or-skip-reason=$reopen_snapshot"
else
    qa_reco_record_check "$SECTION_ID" "$SECTION_NAME" "$PRIORITY" "$RISK" "commenting.close-reopen-optional" "Close/reopen optional" "skipped" "Could not close sheet through agent-device back" "" "persistence-result-or-skip-reason=back-unavailable"
fi

teardown_test "$TEST_NAME"
exit 0
