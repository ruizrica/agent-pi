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

# ── Auto-init tests ──────────────────────────────────────────────
# When .beads/config.yaml exists but the Dolt db is missing, the wrapper
# must call `bd init --from-jsonl --non-interactive ...` before forwarding
# the command. We mock bd via BD_REAL and cmd via CMD_REAL.

setup_tmp_project() {
  local mode="$1"  # missing-db | healthy | no-beads
  local tmp
  tmp=$(mktemp -d)
  case "$mode" in
    missing-db)
      mkdir -p "$tmp/.beads/hooks"
      printf "issue-prefix: test\n" > "$tmp/.beads/config.yaml"
      printf '{"_type":"issue","title":"seed"}\n' > "$tmp/.beads/issues.jsonl"
      ;;
    healthy)
      mkdir -p "$tmp/.beads/embeddeddolt"
      printf "issue-prefix: test\n" > "$tmp/.beads/config.yaml"
      ;;
    no-beads)
      :
      ;;
  esac
  echo "$tmp"
}

mock_bd_script() {
  # Writes a fake bd to $1 that logs invocations to $1.log
  local path="$1"
  cat > "$path" <<'EOF'
#!/usr/bin/env bash
log="${0}.log"
echo "$@" >> "$log"
exit 0
EOF
  chmod +x "$path"
}

echo "Test 7: missing Dolt db + config.yaml present → wrapper calls bd init before cmd"
tmp=$(setup_tmp_project missing-db)
fakebd="$tmp/fake-bd"
mock_bd_script "$fakebd"
out=$(cd "$tmp" && CMD_REAL=echo BD_REAL="$fakebd" "$WRAPPER" task list 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 0 "$rc" "exit code (auto-init then forward)"
bd_log="${fakebd}.log"
if [[ -f "$bd_log" ]] && grep -q "init" "$bd_log" && grep -q "from-jsonl" "$bd_log" && grep -q "non-interactive" "$bd_log"; then
  echo "  PASS: bd init --from-jsonl --non-interactive was invoked"
  pass=$((pass + 1))
else
  echo "  FAIL: expected bd init --from-jsonl --non-interactive to be invoked; bd log:"
  cat "$bd_log" 2>/dev/null | sed 's/^/    /'
  fail=$((fail + 1))
fi
assert_contains "task list" "$out" "real cmd received task list after init"
rm -rf "$tmp"
unset rc

echo "Test 8: healthy db present (embeddeddolt/ dir) → wrapper does NOT call bd init"
tmp=$(setup_tmp_project healthy)
fakebd="$tmp/fake-bd"
mock_bd_script "$fakebd"
out=$(cd "$tmp" && CMD_REAL=echo BD_REAL="$fakebd" "$WRAPPER" task list 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 0 "$rc" "exit code (healthy, no init)"
if [[ -f "${fakebd}.log" ]]; then
  echo "  FAIL: bd should NOT have been invoked when db is healthy; log: $(cat "${fakebd}.log")"
  fail=$((fail + 1))
else
  echo "  PASS: bd was not invoked"
  pass=$((pass + 1))
fi
rm -rf "$tmp"
unset rc

echo "Test 9: no .beads/ directory at all → wrapper does NOT call bd init"
tmp=$(setup_tmp_project no-beads)
fakebd="$tmp/fake-bd"
mock_bd_script "$fakebd"
out=$(cd "$tmp" && CMD_REAL=echo BD_REAL="$fakebd" "$WRAPPER" task list 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 0 "$rc" "exit code (no beads, no init)"
if [[ -f "${fakebd}.log" ]]; then
  echo "  FAIL: bd should NOT have been invoked when .beads/ is absent; log: $(cat "${fakebd}.log")"
  fail=$((fail + 1))
else
  echo "  PASS: bd was not invoked"
  pass=$((pass + 1))
fi
rm -rf "$tmp"
unset rc

echo "Test 10: CMD_AUTO_INIT=off bypasses auto-init even with missing db"
tmp=$(setup_tmp_project missing-db)
fakebd="$tmp/fake-bd"
mock_bd_script "$fakebd"
out=$(cd "$tmp" && CMD_AUTO_INIT=off CMD_REAL=echo BD_REAL="$fakebd" "$WRAPPER" task list 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 0 "$rc" "exit code (auto-init disabled)"
if [[ -f "${fakebd}.log" ]]; then
  echo "  FAIL: bd should NOT have been invoked when CMD_AUTO_INIT=off; log: $(cat "${fakebd}.log")"
  fail=$((fail + 1))
else
  echo "  PASS: bd init was bypassed by CMD_AUTO_INIT=off"
  pass=$((pass + 1))
fi
rm -rf "$tmp"
unset rc

echo "Test 11: auto-init walks up from a subdirectory of the project"
tmp=$(setup_tmp_project missing-db)
mkdir -p "$tmp/sub/nested"
fakebd="$tmp/fake-bd"
mock_bd_script "$fakebd"
out=$(cd "$tmp/sub/nested" && CMD_REAL=echo BD_REAL="$fakebd" "$WRAPPER" task list 2>&1) || rc=$?
rc=${rc:-0}
assert_exit 0 "$rc" "exit code (subdir lookup)"
if [[ -f "${fakebd}.log" ]] && grep -q "init" "${fakebd}.log"; then
  echo "  PASS: bd init invoked when called from project subdirectory"
  pass=$((pass + 1))
else
  echo "  FAIL: expected bd init to be invoked from project subdirectory"
  fail=$((fail + 1))
fi
rm -rf "$tmp"
unset rc

echo ""
echo "Results: $pass passed, $fail failed"
[[ $fail -eq 0 ]]
