# Scout Agent Always-Ready Workflow

## Goal
When in NORMAL mode, pre-spawn a scout subagent at session start so it's always ready. When the main agent needs to gather context (read files, explore codebase, search for information), it delegates to the scout instead of doing it directly. The main agent still handles direct responses, planning, and tool usage for non-recon tasks.

## Architecture
- **Where**: `subagent-widget.ts` (pre-spawn logic) + `mode-prompts.ts` (NORMAL prompt update)
- **How**: On `session_start`, automatically spawn a scout subagent with `autoRemove: false` so it persists. Update NORMAL mode system prompt to instruct the agent to use the scout for context-gathering via `subagent_continue`.
- **Key insight**: The scout uses a persistent session file, so `subagent_continue` works to give it new tasks. We spawn it once with a "standby" task, and the main agent continues it with real work as needed.

## Implementation Steps

- [x] 1. **Add pre-spawn scout logic in `subagent-widget.ts`** — In the `session_start` handler, after loading agent defs, auto-spawn a scout subagent with a standby prompt. Store its ID in a global (`__piScoutId`) so the main agent's system prompt can reference it. Set `autoRemove: false` so it doesn't disappear after 30s.

- [x] 2. **Update NORMAL mode prompt in `mode-prompts.ts`** — Modify `buildNormalPrompt()` to add a new `scoutId` option. When a scout is pre-spawned, add instructions telling the agent to use `subagent_continue` with the scout's ID for any context-gathering work (reading files, searching code, exploring architecture) instead of doing it directly. The agent should still work directly for responses, edits, and tool calls that aren't recon.

- [x] 3. **Wire the scout ID into `mode-cycler.ts`** — In the `before_agent_start` handler for NORMAL mode, read `__piScoutId` from globalThis and pass it to `buildNormalPrompt()`.

- [x] 4. **Handle scout lifecycle edge cases** — If the scout errors out or its session breaks, the main agent should be able to fall back to working directly. Add a check: if the scout's status is "error", clear the global and the prompt won't reference it. Also handle `/new` (session_switch) to re-spawn the scout.

- [x] 5. **Test the workflow** — Verify: (a) scout spawns on session start, (b) NORMAL mode prompt includes scout instructions, (c) main agent delegates reads/searches to scout, (d) scout errors don't break the main workflow.
