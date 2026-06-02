#!/bin/bash
# Run the Feed Scroll & Play QA test on both native platforms by default.
# Setup guard runs automatically for each platform — checks/fixes simulator/emulator,
# dev server, app foreground, and CDP.
#
# Usage:
#   bash .pi/skills/qa-automation/qa-scroll/run.sh                 # iOS + Android
#   bash .pi/skills/qa-automation/qa-scroll/run.sh --platform ios  # iOS only
#   bash .pi/skills/qa-automation/qa-scroll/run.sh --platform android
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SKILL_DIR/../qa.config.sh"

FLOW_SCRIPT="$SKILL_DIR/flows/example-scroll-test.sh"
TEST_SLUG="feed-scroll-play"
REPORT_NAME="${TEST_SLUG}-report.json"
BASE_TEST_OUTPUT_DIR="$TEST_OUTPUT_DIR"
REQUESTED_PLATFORMS="${QA_PLATFORMS:-ios android}"

while [ $# -gt 0 ]; do
    case "$1" in
        --platform|-p)
            REQUESTED_PLATFORMS="${2:-}"
            if [ -z "$REQUESTED_PLATFORMS" ]; then
                echo "Missing value for --platform (ios, android, or both)" >&2
                exit 2
            fi
            shift 2
            ;;
        --ios)
            REQUESTED_PLATFORMS="ios"
            shift
            ;;
        --android)
            REQUESTED_PLATFORMS="android"
            shift
            ;;
        --both)
            REQUESTED_PLATFORMS="ios android"
            shift
            ;;
        --parallel)
            echo "Parallel platform execution is not enabled for this runner; running sequentially."
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--platform ios|android|both]"
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

if ! PLATFORMS="$(qa_expand_platforms "$REQUESTED_PLATFORMS")"; then
    exit 2
fi

summarize_report() {
    local report_file="$1"
    if [ -f "$report_file" ]; then
        echo "Report JSON: $report_file"
        echo ""
        passed=$(node -e "const r=require(process.argv[1]); console.log(r.totalPassed);" "$report_file" 2>/dev/null || echo "?")
        failed=$(node -e "const r=require(process.argv[1]); console.log(r.totalFailed);" "$report_file" 2>/dev/null || echo "?")
        skipped=$(node -e "const r=require(process.argv[1]); console.log(r.totalSkipped);" "$report_file" 2>/dev/null || echo "?")
        duration=$(node -e "const r=require(process.argv[1]); console.log((r.totalDuration/1000).toFixed(1));" "$report_file" 2>/dev/null || echo "?")
        echo "  Passed:  $passed"
        echo "  Failed:  $failed"
        echo "  Skipped: $skipped"
        echo "  Duration: ${duration}s"
    else
        echo "WARNING: No report file generated at $report_file"
    fi
}

run_platform() {
    local platform="$1"
    local session
    session=$(qa_platform_session "$platform")
    local platform_output_dir="$BASE_TEST_OUTPUT_DIR/$platform"
    local platform_screenshot_dir="$platform_output_dir/screenshots"
    local platform_results_file="$platform_output_dir/results.log"
    local report_file="$platform_output_dir/$REPORT_NAME"
    local rc=0

    echo ""
    echo "╔═══════════════════════════════════════════════════╗"
    echo "║  Feed Scroll & Play QA                           ║"
    echo "║  Platform: $platform | Session: $session"
    echo "║  Started: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "╚═══════════════════════════════════════════════════╝"
    echo ""

    if QA_PLATFORM="$platform" \
       ACTIVE_SESSION="$session" \
       TEST_OUTPUT_DIR="$platform_output_dir" \
       SCREENSHOT_DIR="$platform_screenshot_dir" \
       RESULTS_FILE="$platform_results_file" \
       bash "$FLOW_SCRIPT"; then
        rc=0
    else
        rc=$?
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    summarize_report "$report_file"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    return "$rc"
}

EXIT_CODE=0
for platform in $PLATFORMS; do
    if ! run_platform "$platform"; then
        EXIT_CODE=1
    fi
done

exit $EXIT_CODE
