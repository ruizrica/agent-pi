#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════╗
# ║  run-all.sh — Master Test Runner                                  ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  Runs all test flows in the flows/ directory tree for both        ║
# ║  native platforms by default (iOS, then Android).                 ║
# ║                                                                   ║
# ║  Usage:                                                           ║
# ║    bash run-all.sh                         # iOS + Android       ║
# ║    bash run-all.sh smoke                   # suite on both       ║
# ║    bash run-all.sh --platform ios smoke    # one platform        ║
# ║    bash run-all.sh --list                  # list tests          ║
# ╚═══════════════════════════════════════════════════════════════════╝
set -euo pipefail

RUNNER_DIR="$(cd "$(dirname "$0")" && pwd)"
FLOWS_DIR="$RUNNER_DIR/flows"
source "$RUNNER_DIR/../qa.config.sh"

# ── Parse args ───────────────────────────────────────────────────────
SUITE_FILTER=""
LIST_ONLY=false
REQUESTED_PLATFORMS="${QA_PLATFORMS:-ios android}"

while [ $# -gt 0 ]; do
    case "$1" in
        --list)
            LIST_ONLY=true
            shift
            ;;
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
        -h|--help)
            sed -n '1,14p' "$0"
            exit 0
            ;;
        *)
            if [ -z "$SUITE_FILTER" ]; then
                SUITE_FILTER="$1"
                shift
            else
                echo "Unknown argument: $1" >&2
                exit 2
            fi
            ;;
    esac
done

if ! PLATFORMS="$(qa_expand_platforms "$REQUESTED_PLATFORMS")"; then
    exit 2
fi

# ── Find all test scripts ───────────────────────────────────────────
find_tests() {
    if [ -n "$SUITE_FILTER" ]; then
        find "$FLOWS_DIR/$SUITE_FILTER" -name "*.sh" -type f 2>/dev/null | sort
    else
        find "$FLOWS_DIR" -name "*.sh" -type f 2>/dev/null | sort
    fi
}

TESTS=$(find_tests)
TEST_COUNT=$(echo "$TESTS" | grep -c "." || echo "0")

if [ "$TEST_COUNT" -eq 0 ]; then
    echo "No test scripts found in $FLOWS_DIR/"
    [ -n "$SUITE_FILTER" ] && echo "Suite filter: $SUITE_FILTER"
    exit 1
fi

# ── List mode ────────────────────────────────────────────────────────
if [ "$LIST_ONLY" = true ]; then
    echo ""
    echo "Available test flows ($TEST_COUNT):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    while IFS= read -r test; do
        [ -z "$test" ] && continue
        suite=$(basename "$(dirname "$test")")
        name=$(basename "$test" .sh)
        printf "  %-15s %s\n" "[$suite]" "$name"
    done <<< "$TESTS"
    echo ""
    echo "Default native platforms: $PLATFORMS"
    echo ""
    exit 0
fi

# ── Run mode ─────────────────────────────────────────────────────────
BASE_TEST_OUTPUT_DIR="$TEST_OUTPUT_DIR"
BASE_SCREENSHOT_DIR="$SCREENSHOT_DIR"
BASE_RESULTS_FILE="$RESULTS_FILE"
TOTAL_PASS=0
TOTAL_FAIL=0
START_TIME=$(date +%s)
PLATFORM_COUNT=$(echo "$PLATFORMS" | wc -w | tr -d ' ')
TOTAL_RUNS=$((TEST_COUNT * PLATFORM_COUNT))

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  QA Test Runner — Running $TEST_COUNT test(s) on $PLATFORM_COUNT platform(s)"
echo "║  Platforms: $PLATFORMS"
echo "║  Started: $(date '+%Y-%m-%d %H:%M:%S')"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

for platform in $PLATFORMS; do
    session=$(qa_platform_session "$platform")
    platform_output_dir="$BASE_TEST_OUTPUT_DIR/$platform"
    platform_screenshot_dir="$platform_output_dir/screenshots"
    platform_results_file="$platform_output_dir/results.log"

    echo "=============================================================="
    echo "  Platform: $platform | Session: $session"
    echo "  Output:   $platform_output_dir"
    echo "=============================================================="
    echo ""

    while IFS= read -r test; do
        [ -z "$test" ] && continue
        suite=$(basename "$(dirname "$test")")
        name=$(basename "$test" .sh)
        echo "──────────────────────────────────────────────────────────────"
        echo "  Running: [$suite] $name ($platform)"
        echo "──────────────────────────────────────────────────────────────"
        if QA_PLATFORM="$platform" \
           ACTIVE_SESSION="$session" \
           TEST_OUTPUT_DIR="$platform_output_dir" \
           SCREENSHOT_DIR="$platform_screenshot_dir" \
           RESULTS_FILE="$platform_results_file" \
           bash "$test" 2>&1; then
            echo "  Result: PASSED ($platform)"
            TOTAL_PASS=$((TOTAL_PASS + 1))
        else
            status=$?
            echo "  Result: FAILED ($platform, exit code: $status)"
            TOTAL_FAIL=$((TOTAL_FAIL + 1))
        fi
        echo ""
    done <<< "$TESTS"
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "══════════════════════════════════════════════════════════════════"
echo "  QA Test Run Complete"
echo "  Total planned runs: $TOTAL_RUNS"
echo "  Passed: $TOTAL_PASS"
echo "  Failed: $TOTAL_FAIL"
echo "  Duration: ${DURATION}s"
echo "  Outputs: $BASE_TEST_OUTPUT_DIR/{ios,android}/"
echo "  Screenshots: $BASE_SCREENSHOT_DIR or per-platform screenshots/"
echo "══════════════════════════════════════════════════════════════════"
echo ""

if [ "$TOTAL_FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
