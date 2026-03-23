---
name: bitbucket-pr-review
description: Private Bitbucket pull request review workflow built on the Chrome DevTools MCP base. Use for authenticated multi-URL PR reviews with persisted review rules and browser-rendered reports.
---

# Bitbucket PR Review

This private skill defines the intended behavior for `/review-pr`.

## Prerequisites

- **Chrome DevTools MCP must be connected.** This is the ONLY supported extraction method for private Bitbucket repos. It connects to the user's real Chrome browser with their existing cookies and sessions.
- Chrome 136+ installed
- MCP server registered in `~/.claude/mcp.json` with `--autoConnect`
- Chrome launched with `--remote-debugging-port=9222` and the correct `--profile-directory`
- User logged in to Bitbucket in that Chrome profile
- **Always ask the user which Chrome profile to use** — different profiles have different logins

## Workflow

1. Collect one or more Bitbucket PR URLs
2. Ensure the persistent review profile exists on first run
3. Verify Chrome DevTools MCP connection via `mcp__chrome-devtools__list_pages`
4. Verify page access (navigate → snapshot → check for login indicators)
5. Extract PR content via `evaluate_script`
6. Apply saved review rules to every PR reviewed
7. Produce one persisted report per PR

## Important: Do NOT use agent-browser

`agent-browser` uses an **isolated Chromium** without the user's authentication cookies. It will always fail with "Repository not found" or "Log in" for private Bitbucket repos. Never fall back to agent-browser for authenticated pages.

## Persistent Profile

The first review run creates a JSON profile under `.context/pr-review/` so future reviews reuse the same rules and report style.

## Output

Every reviewed PR produces a structured report view suitable for later browsing via `/reports`.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `list_pages` fails or tool not found | Chrome may not be running with debugging, or wrong profile selected. Run the Chrome Profile Launch Sequence from the workflow. |
| "Repository not found" in snapshot | User is not logged in to Bitbucket in Chrome. Ask them to log in and retry. |
| Diffs not loading | Bitbucket lazy-loads diffs. Scroll down and expand collapsed files via `evaluate_script`. |
| MCP server not starting | Check `~/.claude/mcp.json` has the chrome-devtools entry. Restart the CLI session. |
