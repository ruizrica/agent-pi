#!/usr/bin/env bash
# ABOUTME: TDD test for scripts/cmd wrapper that enforces --mission-brief.
# ABOUTME: Uses CMD_REAL=echo to simulate the underlying cmd binary and assert pass-through.

set -u

WRAPPER="$(cd "$(dirname "$0")" && pwd)/cmd"
fail=0
pass=0

assert_exit() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    echo "  PASS: $label (exit $actual)"
    pass=$((pass + 1))
  else
    echo "  FAIL: $label — expected exit $expected, got $actual"
    fail=$((fail + 1))
  fi
}

assert_contains() {
  local needle="$1"
  local haystack="$2"
  local label="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "  PASS: $label"
    pass=$((pass + 1))
  else
    echo "  FAIL: $label — expected output to contain '$needle'; got: $haystack"
    fail=$((fail + 1))
  fi
}

echo "Test 1: root task without --mission-brief must FAIL with exit 2"
out=$(CMD_REAL=echo "$WRAPPER" task add "untitled" --runtime claude-code --model x 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 2 "$rc" "exit code"
assert_contains "mission-brief" "$out" "stderr mentions mission-brief"
unset rc

echo "Test 2: root task WITH --mission-brief must pass through (exit 0)"
out=$(CMD_REAL=echo "$WRAPPER" task add "T" --mission-brief "why" --runtime claude-code --model x 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 0 "$rc" "exit code"
assert_contains "task add" "$out" "real cmd received task add"
unset rc

echo "Test 3: subtask with --parent must pass through (exit 0) even without brief"
out=$(CMD_REAL=echo "$WRAPPER" task add "T" --parent agent-pi-abc1 --runtime claude-code --model x 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 0 "$rc" "exit code"
assert_contains "--parent" "$out" "real cmd received --parent"
unset rc

echo "Test 4: non-task-add (task list) must pass through unconditionally"
out=$(CMD_REAL=echo "$WRAPPER" task list 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 0 "$rc" "exit code"
assert_contains "task list" "$out" "real cmd received task list"
unset rc

echo "Test 5: bare cmd subcommands (e.g. context, guide) pass through"
out=$(CMD_REAL=echo "$WRAPPER" guide agent 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 0 "$rc" "exit code"
unset rc

echo "Test 6: --mission-brief=foo (equals form) is recognized"
out=$(CMD_REAL=echo "$WRAPPER" task add "T" --mission-brief=why --runtime claude-code --model x 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 0 "$rc" "exit code with equals form"
unset rc

echo "Test 7: portable fallback — CMD_REAL pointing at nonexistent path exits 127 with helpful error"
out=$(CMD_REAL=/this/path/does/not/exist "$WRAPPER" list 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 127 "$rc" "exit 127 when CMD_REAL points at non-executable"
assert_contains "unable to locate real 'cmd'" "$out" "error message names CMD_REAL escape hatch (not bash's raw 'No such file' output)"
unset rc

echo "Test 8: portable fallback — CMD_REAL pointing at a real binary works"
out=$(CMD_REAL=$(command -v echo) "$WRAPPER" guide agent 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 0 "$rc" "exit 0 when CMD_REAL is an explicit, executable path"
unset rc

echo ""
echo "Results: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
