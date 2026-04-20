# Implementation Tasks

## 1. Summary command and state scaffolding
- [ ] 1.1 Add a new summary-mode extension or equivalent integration point that registers `/toggle-summary`. (Req: 1, 5)
- [ ] 1.2 Implement a summary toggle controller that turns the work-summary page on and off and restores the normal output region when toggled off. (Req: 1)
- [ ] 1.3 Integrate the toggle state with the active terminal session so summary mode is scoped to the current session. (Req: 1, 4)

## 2. Unified session summary model
- [ ] 2.1 Define shared session-summary interfaces for task status, elapsed time, tool activity, latest output, and optional active-agent context. (Req: 2, 4)
- [ ] 2.2 Implement aggregation logic that derives the main-session work summary from existing session, tool, and orchestration state sources. (Req: 2, 4)
- [ ] 2.3 Add explicit placeholder and empty-state handling for missing summary fields or unavailable tool activity. (Req: 3)

## 3. Terminal summary rendering
- [ ] 3.1 Build a terminal-first single-page summary renderer inspired by the provided snapshot and compatible with existing theme/render helpers. (Req: 2)
- [ ] 3.2 Integrate the renderer with the output area so summary mode replaces normal terminal output while active. (Req: 1, 2)
- [ ] 3.3 Ensure the renderer degrades gracefully for narrow widths and incomplete field values. (Req: 2, 3)

## 4. Session data integrations
- [ ] 4.1 Implement current-task/session summary support using existing active-session and task context data. (Req: 2, 4)
- [ ] 4.2 Implement tool-activity summary support using available tool execution state and recent tool-call history. (Req: 2, 3, 4)
- [ ] 4.3 Implement optional active-agent context so supporting agents can be shown inside the main session summary without becoming separate summary targets. (Req: 2, 4)

## 5. Verification and polish
- [ ] 5.1 Add unit tests for command behavior, toggle state, summary aggregation, tool activity mapping, and renderer output. (Req: 1, 2, 3, 5)
- [ ] 5.2 Add integration tests for command registration, output-area swapping, and summary updates during active work. (Req: 1, 2, 5)
- [ ] 5.3 Validate the final UX against the provided snapshot and document any intentional deviations. (Req: 2)
