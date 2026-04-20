# Requirements Questions

## Answer summary captured

1. UI surface: inline terminal panel replacing the normal output area with a single-page status view.
2. Scope correction: this view is for the main session/task summary only, not for per-subagent inspection.
3. `/summary` with no argument: toggle the summary view for the current session.
4. Non-default target selection: no longer applicable in the current scope.
5. Priority content: status, task, elapsed time, tool count, latest output.
6. Missing live summary data: show an explicit empty-state message.
7. Reuse preference: reuse existing code paths where appropriate.

## Scope clarification
This feature is now defined as a **task/work summary view for the main session only**. It should summarize the task at hand, work in progress, tool calls, current activity, and optionally which agents are being used. It is **not** a per-agent or subagent-targeted summary toggle in the first iteration.
