# Orchestration Stability Profile

This profile captures the current known-good direction for long-running local Pi orchestration. The goal is not to force sample tasks through completion by having the parent agent rescue everything. The goal is for the system flow itself to stay smooth: clear delegation, compact wakeups, durable status checks, clean child completion, and clean parent reconciliation.

## Current Runtime Assumptions

- The active agent model routing in `agents/models.json` is local-first via Ollama.
- Intercom is expected to be installed globally as `npm:pi-intercom`.
- Child Pi launches still use `--no-extensions`, then explicitly re-add only selected plumbing extensions.
- Commander is optional. If the local Commander MCP server is absent, Commander should report offline cleanly instead of spawning a dead hardcoded path.
- Task state, project files, Commander/Taskplane boards, and child session output are the durable sources of truth. Heartbeat messages should point to those sources instead of replaying them.

## Heartbeat Contract

Triggered wakeups are valuable, but they must stay small.

Good heartbeat behavior:

- Wake the orchestrator only to inspect current durable state.
- Tell the orchestrator where to look: task board/list, project files, subagent status/output.
- If work is ready, continue with the next step.
- If work is not ready, wait for the next heartbeat.

Avoid:

- Replaying full task descriptions every heartbeat.
- Replaying the original child prompt on completion.
- Injecting long rule blocks, command manuals, or multi-kilobyte subagent output into the parent transcript.
- Panic language that makes the orchestrator re-litigate whether it is allowed to continue.

In this repo:

- `extensions/tasks.ts` keeps `triggerTurn: true`, but the task validation message is now a compact heartbeat.
- `extensions/subagent-widget.ts` still triggers on child completion, but it sends a short result digest and points the parent back to durable state.
- `extensions/commander-mcp.ts` reports Commander offline cleanly when the backend is missing.

External installed package note:

- `pi-subagents` is installed from npm under `~/.pi/agent/npm/node_modules/pi-subagents`.
- The local runtime tuning sets `needsAttentionAfterMs` to `900_000` and `activeNoticeAfterMs` to `1_200_000`.
- Those numeric defaults are not owned by this repository unless `pi-subagents` is forked, vendored, or patched during install.

## Intercom Contract

Intercom should be available in both parent sessions and child Pi sessions.

Child launchers now explicitly load the installed `pi-intercom` extension after `--no-extensions`. They also pass child metadata so subagents can use `contact_supervisor` when the channel is available.

Use `contact_supervisor` for:

- A real blocking decision.
- A structured interview request.
- A meaningful progress update that changes the plan.

Do not use it for routine completion handoffs. Children should return their normal final result; the parent reconciles against durable state.

## Commander Contract

Commander is useful when the backend exists, but the orchestration system must not depend on a stale machine-specific path.

Commander server resolution now checks:

- `COMMANDER_MCP_SERVER_PATH`
- `~/Projects/commander/services/commander-mcp/dist/server.js`
- `~/Projects/Commander/services/commander-mcp/dist/server.js`
- `~/commander/services/commander-mcp/dist/server.js`
- `~/Workshop/Github-Work/commander/services/commander-mcp/dist/server.js`

If none exists, Commander remains offline and tools return a clear server-not-found message.

## Sample-Run Tuning Loop

For orchestration tuning, disposable tasks are better than precious project work.

Recommended loop:

1. Reset a disposable project fixture.
2. Start a long-ish task that naturally needs orchestration.
3. Let Pi run without outside rescue.
4. If the orchestrator gets confused, stop and inspect the transcript, task state, child state, and process state.
5. Tune prompt text, heartbeat text, timeout numbers, or child launch plumbing.
6. Reset the fixture and run again.

The success criterion is not simply "the task completed." The success criterion is "the task completed through the intended orchestration flow without transcript bloat, instruction loops, stale children, or parent rescue behavior."
