---
name: compact-min
description: "Write a minimal handoff-derived restore state to .context/session-state.json for fast Pi session recovery."
argument-hint: "[focus for restore]"
allowed-tools: '["bash", "read", "write"]'
context: inline
---

# /compact-min — Minimal Restore State

Use this when you need a fast, low-token checkpoint rather than a full memory compaction.

`/compact-min` points to the `/handoff` model but writes a small machine-readable restore file that a fresh Pi session can use immediately.

## Input

Focus: `$ARGUMENTS`

If no focus is provided, infer it from the current task.

## Write target

Always write:

```text
.context/session-state.json
```

Create `.context/` if needed.

## JSON shape

```json
{
  "$schema": "pi-session-state-v3",
  "timestamp": "<ISO timestamp>",
  "focus": "<original request or continuation focus>",
  "current_task": "<what is actively being worked on>",
  "handoff_path": "<latest handoff path if one exists, otherwise null>",
  "state_path": "STATE.md if present, otherwise null",
  "latest_journal_path": "latest journal/YYYY-MM-DD.md if present, otherwise null",
  "key_files": ["<max 8 important paths>"],
  "branch": "<current branch if in a git repo>",
  "worktree": "<repo/worktree root if in a git repo>",
  "status_summary": "<short git/status summary>",
  "agent_memory_available": true,
  "agent_memory_last_query": "<last useful memory query, otherwise null>",
  "agent_memory_indexed_root": "<indexed repo/worktree root if known, otherwise null>",
  "continuation_prompt": "<specific instructions for the next Pi agent>",
  "next_command": "<recommended /pi mode, /handoff, /commit, or /save command>"
}
```

## Workflow

1. Infer the focus from `$ARGUMENTS` or the recent task.
2. Gather only high-signal state:
   - current repo/worktree path if available
   - current branch if available
   - short modified-file summary if available
   - latest handoff path under `.context/handoffs/` if one exists
   - `STATE.md` if present
   - latest `journal/YYYY-MM-DD.md` if present
   - key files recently edited/read from the conversation
   - whether `agent-memory` appears available
   - last useful `agent-memory search`/`code-nav` query if known
   - indexed root hint if setup/code-index was used
3. Write `.context/session-state.json` using the JSON shape above.
4. Print a concise restore instruction.

## Output

```text
Minimal restore state written: .context/session-state.json
For a fuller human handoff, run /handoff.
For Project Memory Pack checkpointing or native compaction, run /cycle-context with an explicit request to cycle memory.
To resume in a fresh session, read .context/session-state.json, STATE.md, and the latest journal entry, then continue from continuation_prompt.
```

## Guardrails

- Keep `continuation_prompt` specific enough for a fresh Pi agent to resume without rereading the transcript.
- Do not write daily logs here; `/cycle-context` owns `STATE.md` and `journal/YYYY-MM-DD.md`, while explicit memory-cycle requests and native compaction handle memory persistence.
- Do not add broad `agent-memory` entries here; this command only records restore hints.
- Do not include secrets or credentials.
