# Feature Initialization: claude-cli-agent-migration

## Raw User Idea
Convert the existing Claude agents via the API/SDK to use the same pattern as `/advisor`, meaning no direct Claude API calls. Every Claude model must use the local Claude Code CLI / Agent SDK execution path (`claude -p` / local Claude Code runtime) to handle work. Build a comprehensive spec for this migration.

## Initial Notes
- Keep existing spec name stable: `claude-cli-agent-migration`
- Desired end state: Claude-family execution is standardized on the local Claude Code CLI runtime path already used by `/advisor`
- Direct Claude SDK/API usage should be removed or blocked for Claude-family execution paths
- Existing `/advisor` flow is the reference implementation pattern
- At least one known direct SDK use exists in `extensions/cleanup-viewer.ts`
- Existing tests already cover parts of the Claude CLI wrapper/runtime behavior
