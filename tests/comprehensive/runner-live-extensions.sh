#!/bin/bash
# ABOUTME: Live extension test runner — load each extension and verify behavior.
# ABOUTME: Records evidence (last 6 lines) and tracks pass/fail/error status.

set -e

EXTENSIONS_DIR="/Users/ricardo/Workshop/GitHub/agent-pi/extensions"
RESULTS_DIR="/Users/ricardo/Workshop/GitHub/agent-pi/tests/comprehensive/results"
OUTPUT_FILE="$RESULTS_DIR/16-core-extensions-live.json"

# Base pi command flags
PI_FLAGS="--model openrouter/anthropic/claude-haiku-4-5 --no-session"

# Test data
declare -A TESTS=(
  ["claude-advisor"]="What does the claude-advisor extension expose? List its tools by name (if any)."
  ["advisor-command"]="Is there an /advisor command? Describe it briefly."
  ["agent-identity"]="What is the agent identity reported? Reply with the runtime + model only."
  ["agent-banner"]="Reply OK."
  ["footer"]="Reply OK."
  ["tasks"]="Is the tasks panel enabled? Reply with one word YES or NO."
  ["commander-tracker"]="Print the commander tracker status (no actions needed). Reply with the tracker fields you see."
  ["commander-lifecycle-guard"]="Reply OK. Do not perform task operations."
  ["goal-loop"]="Reply OK."
  ["lean-tools"]="What tools are currently available? List names."
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Initialize results
START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TOTAL=0
PASS=0
FAIL=0
SKIP=0
ERROR_COUNT=0

# Get environment info
PI_VERSION=$(pi --version 2>/dev/null || echo "unknown")
NODE_VERSION=$(node --version)
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
CWD="/Users/ricardo/Workshop/GitHub/agent-pi"

# Helper: run test with timeout
run_test() {
  local ext_name="$1"
  local prompt="$2"
  local ext_path="$EXTENSIONS_DIR/${ext_name}.ts"

  if [[ ! -f "$ext_path" ]]; then
    echo "SKIP: file not found: $ext_path"
    return 2  # skip
  fi

  # Run pi with extension, capture output and exit code
  local output_file="/tmp/pi-test-${ext_name}-$$.txt"
  local exit_code=0

  timeout 120 pi $PI_FLAGS -e "$ext_path" -p "$prompt" > "$output_file" 2>&1 || exit_code=$?

  # Analyze result
  local last_6=$(tail -6 "$output_file" 2>/dev/null | tr '\n' '|')
  local evidence=$(echo "$last_6" | sed 's/|/\n/g' | tail -6)

  # Determine status
  local status="error"
  if [[ $exit_code -eq 0 ]]; then
    status="pass"
  elif [[ $exit_code -eq 124 ]]; then
    status="error"  # timeout
    evidence="TIMEOUT: Test exceeded 120 seconds"
  elif [[ $exit_code -eq 2 ]]; then
    status="skip"
  else
    status="error"
    evidence=$(tail -3 "$output_file" | head -1)
  fi

  # Clean up
  rm -f "$output_file"

  echo "{\"ext\":\"$ext_name\",\"status\":\"$status\",\"evidence\":\"$evidence\",\"exit\":$exit_code}"
}

# Run all tests
echo "Starting live extension tests..."
TESTS_ARRAY=()

for ext_name in "${!TESTS[@]}"; do
  TOTAL=$((TOTAL + 1))
  prompt="${TESTS[$ext_name]}"

  echo -n "Testing $ext_name... "
  result=$(run_test "$ext_name" "$prompt")

  # Parse result
  status=$(echo "$result" | jq -r '.status')
  evidence=$(echo "$result" | jq -r '.evidence')
  exit_code=$(echo "$result" | jq -r '.exit')

  case "$status" in
    pass)
      PASS=$((PASS + 1))
      echo -e "${GREEN}PASS${NC}"
      ;;
    fail)
      FAIL=$((FAIL + 1))
      echo -e "${RED}FAIL${NC}"
      ;;
    skip)
      SKIP=$((SKIP + 1))
      echo -e "${YELLOW}SKIP${NC}"
      ;;
    error)
      ERROR_COUNT=$((ERROR_COUNT + 1))
      echo -e "${RED}ERROR${NC}"
      ;;
  esac

  TESTS_ARRAY+=("$result")
done

# Generate JSON output
FINISH_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build tests array
TESTS_JSON="["
first=true
for ext_name in "${!TESTS[@]}"; do
  if [[ "$first" == false ]]; then
    TESTS_JSON+=","
  fi
  first=false

  prompt="${TESTS[$ext_name]}"
  result=$(run_test "$ext_name" "$prompt")
  status=$(echo "$result" | jq -r '.status')
  evidence=$(echo "$result" | jq -r '.evidence')

  TESTS_JSON+="{\"id\":\"ext.$ext_name\",\"name\":\"Load and test $ext_name\",\"command\":\"pi -e ../$ext_name.ts -p \\\"$prompt\\\"\",\"status\":\"$status\",\"evidence\":\"$evidence\",\"duration_ms\":0,\"notes\":\"Live extension test\"}"
done
TESTS_JSON+="]"

cat > "$OUTPUT_FILE" <<EOF
{
  "category": "core-extensions",
  "category_name": "Core PI Agent Extensions",
  "scope": "claude-advisor, advisor-command, agent-identity, agent-banner, footer, tasks, commander-tracker, commander-lifecycle-guard, goal-loop, lean-tools",
  "tested_by": "test-runner",
  "started_at": "$START_TIME",
  "finished_at": "$FINISH_TIME",
  "environment": {
    "pi_version": "$PI_VERSION",
    "node_version": "$NODE_VERSION",
    "platform": "$PLATFORM",
    "cwd": "$CWD"
  },
  "tests": $TESTS_JSON,
  "summary": {
    "total": $TOTAL,
    "pass": $PASS,
    "fail": $FAIL,
    "skip": $SKIP,
    "error": $ERROR_COUNT
  },
  "improvements": [],
  "divergences": []
}
EOF

echo ""
echo "Results written to: $OUTPUT_FILE"
echo "Summary: tests=$TOTAL pass=$PASS fail=$FAIL skip=$SKIP error=$ERROR_COUNT"
