---
name: chrome-devtools-mcp-base
description: >
  Browser automation via your REAL running Chrome instance using Chrome DevTools MCP.
  Use for ALL tasks requiring authenticated browser access — Bitbucket PR reviews, Jira,
  Google Workspace, internal tools, or any site where the user is already logged in.
  Triggers include "review this PR", "check Bitbucket", "open Jira", "inspect this page",
  "take a screenshot of my tab", "check page performance", "debug this page",
  "run a Lighthouse audit", or any task where agent-browser gets blocked as a test browser.
allowed-tools: mcp__chrome-devtools__*
---

# Browser Automation with Chrome DevTools MCP

## When to Use This Skill (CRITICAL DECISION)

Chrome DevTools MCP connects to the user's **real, running Chrome** — with all their cookies, sessions, and login state. This is the **only** browser tool that can access authenticated pages without being flagged as a test browser.

### Use Chrome DevTools MCP for:
- ✅ **Authenticated sites** — Bitbucket, Jira, Google, GitHub (user is already logged in)
- ✅ **PR reviews** — accessing private repos the user has access to in Chrome
- ✅ **Internal/corporate tools** — anything behind SSO or OAuth
- ✅ **Performance profiling** — full DevTools trace recording and analysis
- ✅ **Lighthouse audits** — accessibility, SEO, best practices
- ✅ **Network inspection** — analyzing requests, response bodies, headers
- ✅ **Console debugging** — reading console messages with source-mapped stack traces

### Use agent-browser instead for:
- 🔧 **localhost / 127.0.0.1** — local dev server testing (purpose-built)
- 🔧 **Sandboxed automation** — when you don't want to touch the user's real browser
- 🔧 **iOS Simulator** — mobile Safari testing
- 🔧 **Parallel sessions** — multiple isolated browser instances
- 🔧 **State save/load** — persisting auth state to files

### Decision flowchart:
```
Is the page behind authentication?
  YES → Chrome DevTools MCP
  NO  → Is it localhost or local network?
    YES → agent-browser
    NO  → Either works. Prefer Chrome DevTools MCP for richer debugging.
```

## Prerequisites

Chrome DevTools MCP requires one-time setup:

1. **Chrome 144+** running on the machine
2. Remote debugging enabled: `chrome://inspect/#remote-debugging`
3. MCP server registered in `~/.claude/mcp.json` (already done)

See `.context/chrome-devtools-setup.md` for the full setup guide.

## Core Workflow

Every browser automation follows the same pattern as agent-browser, but with MCP tool names:

1. **Navigate**: `navigate_page` with URL
2. **Snapshot**: `take_snapshot` (get element UIDs like `[uid="e1"]`)
3. **Interact**: Use UIDs to `click`, `fill`, `press_key`
4. **Re-snapshot**: After navigation or DOM changes, get fresh UIDs

```
# Step 1: Navigate to a page
navigate_page { url: "https://bitbucket.org/team/repo/pull-requests/82" }

# Step 2: Take a snapshot (accessibility tree with UIDs)
take_snapshot {}

# Step 3: Interact using UIDs from snapshot
click { uid: "e5" }

# Step 4: Re-snapshot after interaction
take_snapshot {}
```

## Essential Tools Quick Reference

### Navigation
| Tool | Purpose |
|------|---------|
| `navigate_page` | Go to URL, back, forward, reload |
| `new_page` | Open URL in new tab |
| `list_pages` | List all open browser tabs |
| `select_page` | Switch to a specific tab |
| `close_page` | Close a tab |
| `wait_for` | Wait for text to appear on page |

### Input
| Tool | Purpose |
|------|---------|
| `click` | Click an element by UID |
| `fill` | Type text into input/textarea or select option |
| `fill_form` | Fill multiple form fields at once |
| `type_text` | Type text into focused element |
| `press_key` | Press key or key combo (Enter, Ctrl+A, etc.) |
| `hover` | Hover over element |
| `drag` | Drag one element onto another |
| `upload_file` | Upload file through file input |
| `handle_dialog` | Accept or dismiss browser dialogs |

### Inspection
| Tool | Purpose |
|------|---------|
| `take_snapshot` | A11y tree snapshot with UIDs (preferred over screenshot) |
| `take_screenshot` | Visual screenshot (PNG/JPEG/WebP) |
| `evaluate_script` | Run JavaScript in the page context |
| `list_console_messages` | Get console log/warn/error messages |
| `get_console_message` | Get a specific console message by ID |
| `list_network_requests` | List all network requests |
| `get_network_request` | Get request/response details |

### Performance & Auditing
| Tool | Purpose |
|------|---------|
| `performance_start_trace` | Start recording a performance trace |
| `performance_stop_trace` | Stop trace and get results |
| `performance_analyze_insight` | Deep-dive on a specific perf insight |
| `take_memory_snapshot` | Capture heap snapshot for leak debugging |
| `lighthouse_audit` | Accessibility, SEO, best practices audit |

### Emulation
| Tool | Purpose |
|------|---------|
| `emulate` | Set dark mode, throttle CPU/network, change viewport |
| `resize_page` | Resize browser window |

## Common Patterns

### Authenticated Page Access (e.g., PR Review)

```
# Navigate to the authenticated page
navigate_page { url: "https://bitbucket.org/team/repo/pull-requests/82" }

# Take a snapshot to verify we're on the right page (not a login redirect)
take_snapshot {}

# If snapshot shows login page, ask user to log in manually in Chrome
# If snapshot shows PR content, proceed with extraction

# Extract page content via JavaScript
evaluate_script {
  function: "() => { return document.body.innerText; }"
}
```

### Login Detection

After navigating to a page, check if the snapshot contains login indicators:

```
take_snapshot {}
# Look for: "Log in", "Sign in", "Authentication required", login form fields
# If found → tell the user to log in manually in their Chrome
# If not found → page is accessible, proceed
```

### Extract PR Diff Content

```
# Navigate to PR diff page
navigate_page { url: "https://bitbucket.org/team/repo/pull-requests/82" }

# Wait for content to load
wait_for { text: ["Diff", "Changes", "pull request"] }

# Get the full page text
evaluate_script {
  function: "() => { return document.body.innerText.substring(0, 50000); }"
}

# Or get structured diff data
evaluate_script {
  function: "() => { const diffs = document.querySelectorAll('[data-qa=\"pr-diff-file-container\"]'); return Array.from(diffs).map(d => ({ file: d.querySelector('[data-qa=\"bk-filepath\"]')?.textContent, content: d.textContent?.substring(0, 5000) })); }"
}
```

### Screenshot for Visual Review

```
# Full page screenshot
take_screenshot { fullPage: true, filePath: "/tmp/pr-screenshot.png" }

# Element-specific screenshot
take_snapshot {}
# Find the UID of the element you want
take_screenshot { uid: "e15", filePath: "/tmp/element.png" }
```

### Network Request Inspection

```
# Navigate to page (requests start recording)
navigate_page { url: "https://example.com/api-heavy-page" }

# List all network requests
list_network_requests {}

# Get details of a specific request (including response body)
get_network_request { reqid: 5 }
```

### Performance Profiling

```
# Navigate first
navigate_page { url: "https://example.com" }

# Start trace with auto-stop and page reload
performance_start_trace { reload: true, autoStop: true }

# Analyze specific insights from the results
performance_analyze_insight { insightSetId: "...", insightName: "LCPBreakdown" }
```

### Lighthouse Audit

```
# Run audit on current page
lighthouse_audit { device: "desktop", mode: "navigation" }

# Snapshot mode (no reload, current state)
lighthouse_audit { device: "mobile", mode: "snapshot" }
```

## UID Lifecycle (Important)

UIDs from `take_snapshot` are invalidated when the page changes. **Always re-snapshot after:**

- Clicking links or buttons that navigate
- Form submissions
- Dynamic content loading (modals, dropdowns, SPA navigation)

```
click { uid: "e5" }           # May navigate or change DOM
take_snapshot {}               # MUST re-snapshot
click { uid: "e1" }           # Use new UIDs
```

## Working With Multiple Tabs

```
# List current tabs
list_pages {}

# Open a new tab
new_page { url: "https://example.com" }

# Switch between tabs
select_page { pageId: 2 }

# Take snapshot of currently selected tab
take_snapshot {}

# Close a tab (can't close the last one)
close_page { pageId: 3 }
```

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| `list_pages` fails or tool not found | MCP server not connected | Ensure Chrome is running, remote debugging is enabled (`chrome://flags/#allow-remote-debugging` → Enabled), then restart the CLI session |
| Tools time out | Chrome is unresponsive or not running | Restart Chrome, then restart the CLI session |
| "Repository not found" after navigation | User not authenticated on the target site | Ask the user to log in in their Chrome browser, then re-navigate |
| agent-browser works but Chrome DevTools MCP doesn't | Different browsers — agent-browser uses isolated Chromium | They are separate tools. Agent-browser has no access to Chrome sessions. Use Chrome DevTools MCP for auth. |
| MCP config seems correct but tools still fail | CLI session needs restart after config change | Restart the CLI session (`exit` + re-launch) |

### CRITICAL: Never mix agent-browser and Chrome DevTools MCP for auth

- **agent-browser** = isolated Chromium, no cookies, no sessions → for localhost and sandboxed testing only
- **Chrome DevTools MCP** = the user's real Chrome, with all their logins → for authenticated pages

If a private repo URL fails in agent-browser, do NOT try to "log in" via agent-browser. Instead, use Chrome DevTools MCP where the user is already authenticated. If Chrome DevTools MCP is not available, guide the user through setup — don't fall back.

## Deep-Dive Documentation

| Reference | When to Use |
|-----------|-------------|
| [references/tool-reference.md](references/tool-reference.md) | Full tool reference with all parameters |
| [references/authentication-patterns.md](references/authentication-patterns.md) | Patterns for authenticated workflows |
| [references/vs-agent-browser.md](references/vs-agent-browser.md) | Detailed comparison with agent-browser |
