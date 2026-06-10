#!/usr/bin/env bash
# ABOUTME: TDD test for cmd-task-hook.sh — triviality/secret skip on start, auto-complete on stop.
# ABOUTME: Stubs the cmd binary via PATH spy; pipes JSON hook payloads on stdin; black-box asserts on the spy log.

set -u

HOOKS_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$HOOKS_DIR/cmd-task-hook.sh"

fail=0
pass=0

assert_contains() { # needle haystack label
  if [[ "$2" == *"$1"* ]]; then echo "  PASS: $3"; pass=$((pass+1));
  else echo "  FAIL: $3 — expected to contain '$1'; got: $2"; fail=$((fail+1)); fi
}
assert_not_contains() { # needle haystack label
  if [[ "$2" != *"$1"* ]]; then echo "  PASS: $3"; pass=$((pass+1));
  else echo "  FAIL: $3 — expected NOT to contain '$1'; got: $2"; fail=$((fail+1)); fi
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export CMD_TASK_HOOK_ROOT="$WORK/proj"
mkdir -p "$CMD_TASK_HOOK_ROOT/.commander/hook-sessions"

# Spy cmd: logs argv, returns canned JSON. `task show` reports a still-working task
# so the stop path must take action (auto-complete) rather than no-op.
mkdir -p "$WORK/bin"
cat > "$WORK/bin/cmd" <<'EOF'
#!/usr/bin/env bash
echo "$@ [session=${CMD_SESSION_ID:-none}]" >> "$SPY_LOG"
case "${1:-} ${2:-}" in
  "task add")     printf '{"id":"1","bead_id":"cmd-test1"}\n' ;;
  "task claim")   printf '{"id":"1","status":"working"}\n' ;;
  "task show")    printf '{"status":"working"}\n' ;;
  "task update")  printf '{"id":"1","status":"completed"}\n' ;;
  "task comment") printf '{"ok":true}\n' ;;
  *) : ;;
esac
exit 0
EOF
chmod +x "$WORK/bin/cmd"
export PATH="$WORK/bin:$PATH"

payload() { # prompt session_id [stop_active]
  jq -nc --arg p "$1" --arg sid "$2" --argjson stop "${3:-false}" \
    '{prompt:$p, session_id:$sid, stop_hook_active:$stop, model:"test-model"}'
}

run_start() { # prompt session_id  -> resets spy log
  SPY_LOG="$WORK/spy.$2.log"; export SPY_LOG; : > "$SPY_LOG"
  payload "$1" "$2" | "$HOOK" start cursor >/dev/null 2>&1 || true
}
run_stop() { # session_id (reuses SPY_LOG for that session, appends)
  SPY_LOG="$WORK/spy.$1.log"; export SPY_LOG
  payload "stop" "$1" false | "$HOOK" stop cursor >/dev/null 2>&1 || true
}

echo "── Fix A: triviality + secret skip on start ──"

run_start "test" "s-test"
assert_not_contains "task add" "$(cat "$WORK/spy.s-test.log")" "trivial prompt 'test' does NOT mint a task"

run_start "here is the key mcp_live_287b079e48ce_WhJbXzBgC2JZ7_IIrDsNVqH-u0viFAan6MijFCbnq9M" "s-secret"
assert_not_contains "task add" "$(cat "$WORK/spy.s-secret.log")" "pasted mcp_live_ secret does NOT mint a task"

run_start "sk-ant-api03-AbCdEf0123456789AbCdEf0123456789AbCdEf01" "s-sk"
assert_not_contains "task add" "$(cat "$WORK/spy.s-sk.log")" "pasted sk- secret does NOT mint a task"

run_start "implement the foo widget in bar.ts and wire it to the store" "s-real"
assert_contains "task add" "$(cat "$WORK/spy.s-real.log")" "real work prompt DOES mint a task"

echo "── Fix C: CMD_SESSION_ID export for the cmd session ledger ──"

run_start "implement the session ledger widget in baz.ts" "s-ledger"
assert_contains "[session=cursor-s-ledger]" "$(cat "$WORK/spy.s-ledger.log")" "cursor platform exports cursor-<id> as CMD_SESSION_ID"

# claude platform must use the RAW session id so it matches CLAUDE_CODE_SESSION_ID
# (and therefore the same ledger the agent's own cmd calls write to).
SPY_LOG="$WORK/spy.s-claude.log"; export SPY_LOG; : > "$SPY_LOG"
payload "implement the claude ledger widget in qux.ts" "s-claude" | "$HOOK" start claude >/dev/null 2>&1 || true
assert_contains "[session=s-claude]" "$(cat "$WORK/spy.s-claude.log")" "claude platform exports the raw session id"

echo

echo "── Fix B: auto-complete the open task on stop ──"

# A real prompt creates session state (task_id=1) ...
run_start "build the dashboard chart panel and add tests" "s-stop"
# ... then stop with the task still 'working' must auto-complete it.
run_stop "s-stop"
assert_contains "task update 1 --status completed" "$(cat "$WORK/spy.s-stop.log")" "stop auto-completes the still-open task"

echo
echo "TOTAL: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
