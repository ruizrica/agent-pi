#!/usr/bin/env bash
# ABOUTME: Claude Code + Cursor hooks that create/claim cmd tasks on start and nudge completion on stop.
# ABOUTME: Mirrors agent-pi tasks.ts discipline: one claimed cmd task per user prompt, agent updates on done.

set -euo pipefail

MODE="${1:-}"
PLATFORM="${2:-}"
INPUT="$(cat)"

if [[ -z "$MODE" || -z "$PLATFORM" ]]; then
  echo "usage: $0 <start|stop> <claude|cursor>" >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  if [[ "$MODE" == "start" && "$PLATFORM" == "cursor" ]]; then
    printf '%s\n' '{"continue":true,"permission":"allow"}'
  elif [[ "$MODE" == "stop" && "$PLATFORM" == "cursor" ]]; then
    printf '%s\n' '{}'
  fi
  exit 0
fi

if ! command -v cmd >/dev/null 2>&1; then
  if [[ "$MODE" == "start" && "$PLATFORM" == "cursor" ]]; then
    printf '%s\n' '{"continue":true,"permission":"allow"}'
  elif [[ "$MODE" == "stop" && "$PLATFORM" == "cursor" ]]; then
    printf '%s\n' '{}'
  fi
  exit 0
fi

ROOT="${CMD_TASK_HOOK_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cd "$ROOT"

SESSION_DIR=".commander/hook-sessions"
mkdir -p "$SESSION_DIR"

log() {
  if [[ "${CMD_TASK_HOOK_DEBUG:-0}" == "1" ]]; then
    echo "[cmd-task-hook] $*" >&2
  fi
}

json_field() {
  local expr="$1"
  echo "$INPUT" | jq -r "$expr // empty" 2>/dev/null || true
}

resolve_session_id() {
  json_field '.session_id // .conversation_id // .sessionId // .composer_id // "unknown"'
}

resolve_prompt() {
  json_field '.prompt // .content // .user_message // .message // empty'
}

resolve_model() {
  local from_input
  from_input="$(json_field '.model // .model_name // empty')"
  if [[ -n "$from_input" ]]; then
    printf '%s' "$from_input"
    return
  fi
  if [[ -n "${CURSOR_MODEL:-}" ]]; then
    printf '%s' "$CURSOR_MODEL"
    return
  fi
  if [[ -n "${CLAUDE_MODEL:-}" ]]; then
    printf '%s' "$CLAUDE_MODEL"
    return
  fi
  printf '%s' "unknown"
}

resolve_runtime() {
  case "$PLATFORM" in
    claude) printf '%s' "claude-code" ;;
    cursor) printf '%s' "cursor" ;;
    *) printf '%s' "unknown" ;;
  esac
}

# Export a stable CMD_SESSION_ID so every cmd call below lands in cmd's session
# ledger (`cmd session tasks/reconcile`). For claude the RAW session id is used
# — it must match CLAUDE_CODE_SESSION_ID, which the agent's own shell commands
# already carry, so hook-minted tasks and agent-made tasks share one ledger.
# Cursor spawns shells with no session env, so its hook tasks get cursor-<id>.
export_cmd_session_id() {
  local raw safe
  raw="$(resolve_session_id)"
  [[ -z "$raw" || "$raw" == "unknown" ]] && return 0
  safe="$(printf '%s' "$raw" | sed -E 's/[^A-Za-z0-9._-]+//g')"
  [[ -z "$safe" ]] && return 0
  if [[ "$PLATFORM" == "claude" ]]; then
    CMD_SESSION_ID="${safe:0:128}"
  else
    safe="${PLATFORM}-${safe}"
    CMD_SESSION_ID="${safe:0:128}"
  fi
  export CMD_SESSION_ID
}
export_cmd_session_id

truncate() {
  local text="$1"
  local max="$2"
  if ((${#text} <= max)); then
    printf '%s' "$text"
  else
    printf '%s…' "${text:0:$((max - 1))}"
  fi
}

one_line() {
  printf '%s' "$1" | tr '\r\n\t' '   ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//'
}

# True when the prompt contains something that looks like a credential/secret.
# Pasted API keys must never be turned into a (persisted, plaintext) cmd task.
looks_like_secret() {
  local prompt="$1" tok
  if printf '%s' "$prompt" | grep -Eqi \
    'mcp_live_[a-z0-9_-]{8,}|sk-(ant-)?[a-z0-9_-]{16,}|gh[psoru]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|AKIA[0-9A-Z]{12,}|xox[baprs]-[a-z0-9-]{10,}|AIza[0-9a-z_-]{30,}|eyJ[a-z0-9_-]{18,}\.[a-z0-9_-]{10,}|BEGIN [A-Z ]*PRIVATE KEY'; then
    return 0
  fi
  # Any single very long unbroken token mixing letters+digits (opaque keys, hashes);
  # skip paths/urls/dotted identifiers which are legitimately long.
  for tok in $prompt; do
    if ((${#tok} >= 40)); then
      case "$tok" in
        */*|http*|*.*) : ;;
        *) [[ "$tok" == *[A-Za-z]* && "$tok" == *[0-9]* ]] && return 0 ;;
      esac
    fi
  done
  return 1
}

should_skip_prompt() {
  local prompt="$1"
  looks_like_secret "$prompt" && return 0
  local normalized
  normalized="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+//g')"
  [[ -z "$normalized" ]] && return 0
  ((${#normalized} < 4)) && return 0
  case "$normalized" in
    yes|yep|yeah|ok|okay|kk|continue|go|goon|proceed|thanks|thankyou|ty|thx|stop|done|next|nvm) return 0 ;;
    test|testing|tst|hi|hey|hello|sup|yo|lgtm|shipit|nice|cool|great|perfect) return 0 ;;
  esac
  return 1
}

session_file() {
  local session_id="$1"
  local safe_id
  safe_id="$(printf '%s' "$session_id" | sed -E 's/[^a-zA-Z0-9._-]+/_/g')"
  printf '%s/%s.json' "$SESSION_DIR" "$safe_id"
}

write_session_state() {
  local session_id="$1"
  local task_id="$2"
  local bead_id="$3"
  local title="$4"
  local runtime="$5"
  local model="$6"
  local file
  file="$(session_file "$session_id")"
  jq -n \
    --arg session_id "$session_id" \
    --arg task_id "$task_id" \
    --arg bead_id "$bead_id" \
    --arg title "$title" \
    --arg runtime "$runtime" \
    --arg model "$model" \
    --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      session_id: $session_id,
      task_id: $task_id,
      bead_id: $bead_id,
      title: $title,
      runtime: $runtime,
      model: $model,
      created_at: $created_at
    }' >"$file"
}

read_session_state() {
  local session_id="$1"
  local file
  file="$(session_file "$session_id")"
  [[ -f "$file" ]] || return 1
  cat "$file"
}

emit_start_allow() {
  case "$PLATFORM" in
    claude)
      printf '%s\n' '{}'
      ;;
    cursor)
      printf '%s\n' '{"continue":true,"permission":"allow"}'
      ;;
  esac
}

emit_start_context() {
  local context="$1"
  case "$PLATFORM" in
    claude)
      jq -n \
        --arg context "$context" \
        '{
          hookSpecificOutput: {
            hookEventName: "UserPromptSubmit",
            additionalContext: $context
          }
        }'
      ;;
    cursor)
      jq -n \
        --arg context "$context" \
        '{
          continue: true,
          permission: "allow",
          additional_context: $context
        }'
      ;;
  esac
}

emit_stop_ok() {
  case "$PLATFORM" in
    claude)
      printf '%s\n' '{"decision":"approve","continue":true}'
      ;;
    cursor)
      printf '%s\n' '{}'
      ;;
  esac
}

emit_stop_nudge() {
  local message="$1"
  case "$PLATFORM" in
    claude)
      jq -n \
        --arg reason "$message" \
        '{
          decision: "block",
          reason: $reason
        }'
      ;;
    cursor)
      jq -n \
        --arg followup_message "$message" \
        '{
          followup_message: $followup_message
        }'
      ;;
  esac
}

handle_start() {
  if [[ "${CMD_TASK_HOOK_DISABLE:-0}" == "1" ]]; then
    emit_start_allow
    return
  fi

  local session_id prompt runtime model title brief task_json task_id bead_id context
  session_id="$(resolve_session_id)"
  prompt="$(one_line "$(resolve_prompt)")"
  runtime="$(resolve_runtime)"
  model="$(resolve_model)"

  if should_skip_prompt "$prompt"; then
    log "skip short/meta prompt for session $session_id"
    emit_start_allow
    return
  fi

  title="$(truncate "$prompt" 80)"
  brief="$(truncate "$prompt" 280)"
  if ((${#brief} < 60)); then
    brief="${brief} Tracked automatically by cmd task hook; update status when the work is complete."
  fi

  if ! task_json="$(cmd task add \
    --title "$title" \
    --mission-brief "$brief" \
    --runtime "$runtime" \
    --model "$model" \
    --json 2>/dev/null)"; then
    log "cmd task add failed"
    emit_start_allow
    return
  fi

  task_id="$(printf '%s' "$task_json" | jq -r '.id // empty')"
  bead_id="$(printf '%s' "$task_json" | jq -r '.bead_id // empty')"
  if [[ -z "$task_id" ]]; then
    log "cmd task add returned no id"
    emit_start_allow
    return
  fi

  if ! cmd task claim "$task_id" --runtime "$runtime" --model "$model" --json >/dev/null 2>&1; then
    log "cmd task claim failed for #$task_id"
  fi

  write_session_state "$session_id" "$task_id" "$bead_id" "$title" "$runtime" "$model"

  context=$'Cmd task discipline (auto-created by hook):\n'
  context+="- Task: #${task_id}"
  [[ -n "$bead_id" ]] && context+=" (${bead_id})"
  context+=$'\n- Title: '"$title"
  context+=$'\n- Status: claimed / working'
  context+=$'\n\nYou are responsible for keeping this cmd task accurate before stopping:'
  context+=$'\n1. Progress: `cmd task comment '"${task_id}"$' "<note>" --type progress --runtime '"${runtime}"$' --model '"${model}"$'`'
  context+=$'\n2. Done: `cmd task update '"${task_id}"$' --status completed --runtime '"${runtime}"$' --model '"${model}"$'`'
  context+=$'\n3. Blocked/handoff: comment with `--type handoff` or `--type error`, then update status accurately.'
  context+=$'\n\nDo not leave a claimed working task open when you stop.'

  emit_start_context "$context"
}

handle_stop() {
  if [[ "${CMD_TASK_HOOK_DISABLE:-0}" == "1" ]]; then
    emit_stop_ok
    return
  fi

  local stop_hook_active session_id state task_id runtime model status_json status ref context
  stop_hook_active="$(json_field '.stop_hook_active // false')"
  if [[ "$stop_hook_active" == "true" ]]; then
    emit_stop_ok
    return
  fi

  session_id="$(resolve_session_id)"
  if ! state="$(read_session_state "$session_id" 2>/dev/null)"; then
    emit_stop_ok
    return
  fi

  task_id="$(printf '%s' "$state" | jq -r '.task_id // empty')"
  runtime="$(printf '%s' "$state" | jq -r '.runtime // empty')"
  model="$(printf '%s' "$state" | jq -r '.model // empty')"
  ref="$(printf '%s' "$state" | jq -r '.bead_id // .task_id // empty')"
  if [[ -z "$task_id" ]]; then
    emit_stop_ok
    return
  fi

  if ! status_json="$(cmd task show "$task_id" --json 2>/dev/null)"; then
    emit_stop_ok
    return
  fi

  status="$(printf '%s' "$status_json" | jq -r '.status // empty' | tr '[:upper:]' '[:lower:]')"
  case "$status" in
    working|in-progress|in_progress|pending|open)
      # Auto-complete the hook-created task so it can never be left orphaned.
      # The agent may forget to close it; the lifecycle of a per-prompt tracking
      # task ends with the prompt, so closing it on stop is the safe default.
      cmd task comment "$task_id" "Auto-completed by cmd task hook on stop (per-prompt tracking task)." \
        --type progress --runtime "$runtime" --model "$model" >/dev/null 2>&1 || true
      if cmd task update "$task_id" --status completed --runtime "$runtime" --model "$model" >/dev/null 2>&1; then
        log "auto-completed task #${task_id} on stop"
        rm -f "$(session_file "$session_id")" 2>/dev/null || true
      else
        log "auto-complete failed for #${task_id} on stop — left for housekeep"
      fi
      emit_stop_ok
      return
      ;;
  esac

  emit_stop_ok
}

case "$MODE" in
  start) handle_start ;;
  stop) handle_stop ;;
  *)
    echo "unknown mode: $MODE" >&2
    exit 2
    ;;
esac

exit 0
