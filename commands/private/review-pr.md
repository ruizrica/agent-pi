---
name: review-pr
description: "Private Bitbucket PR code review — collect URLs, verify access via Chrome DevTools MCP, apply review profile, generate per-PR reports."
argument-hint: "[url1 url2 ...]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "show_pr_review_viewer", "show_pr_review_report", "chrome_devtools_mcp_connect", "chrome_devtools_mcp_verify_access", "chrome_devtools_mcp_setup_check", "mcp__chrome-devtools__navigate_page", "mcp__chrome-devtools__take_snapshot", "mcp__chrome-devtools__take_screenshot", "mcp__chrome-devtools__evaluate_script", "mcp__chrome-devtools__list_pages", "mcp__chrome-devtools__wait_for", "mcp__chrome-devtools__click", "mcp__chrome-devtools__scroll", "mcp__chrome-devtools__new_page", "mcp__chrome-devtools__select_page", "show_reports", "commander_task", "commander_mailbox", "ask_user"]
---

# /review-pr — Private Bitbucket PR Review Workflow

You are running the private `/review-pr` workflow. Follow these steps exactly.

## Step 1: Bootstrap Review Profile

Check if `.context/pr-review/profile.json` exists.
- If it does NOT exist, create it with these defaults:
```json
{
  "version": 1,
  "createdAt": "<now>",
  "updatedAt": "<now>",
  "reviewRules": [
    "Flag correctness, reliability, maintainability, and security issues.",
    "Prefer actionable findings over stylistic commentary.",
    "Include file/path context whenever available."
  ],
  "severityLabels": ["critical", "high", "medium", "low"],
  "reportStyle": "standard",
  "requireFilePaths": true,
  "requireSuggestedFixes": true
}
```
- If it exists, read it and use the saved rules for all reviews.

## Step 2: Collect PR URLs

If the user provided URLs in arguments (`$ARGUMENTS`), use those directly.

If no URLs were provided, open the PR review request viewer to collect them:
```
show_pr_review_viewer { title: "PR Review Request" }
```

The viewer will:
1. Let the user enter one or more Bitbucket PR URLs
2. Show initial status (private repos will show "needs browser verification")
3. Return the list of URLs for review

## Step 3: Connect Chrome DevTools MCP (REQUIRED)

Chrome DevTools MCP is **required** for private Bitbucket PR reviews. It connects to the user's real Chrome browser with their existing cookies and sessions. Do NOT fall back to `agent-browser` — it uses an isolated Chromium without authentication and will always fail for private repos.

### 3a. Verify Connection

Call the native MCP tool `mcp__chrome-devtools__list_pages` to check if Chrome is connected.

**If it succeeds** (returns a list of open tabs):
- Chrome DevTools MCP is connected — proceed to Step 3b.

**If it fails** (error, timeout, or tool not found):
- Chrome DevTools MCP is NOT available. Run the **Chrome Profile Launch** sequence below.

### Chrome Profile Launch Sequence

When Chrome DevTools MCP is not connected, you need to launch Chrome with remote debugging enabled on the correct profile. **Always ask the user which profile to use.**

**Step 1: Discover available Chrome profiles.**

Run this via Bash:
```bash
for dir in "$HOME/Library/Application Support/Google/Chrome/Default" "$HOME/Library/Application Support/Google/Chrome/"Profile*; do
  name=$(python3 -c "import json; d=json.load(open('$dir/Preferences')); print(d.get('profile',{}).get('name','unknown'))" 2>/dev/null || echo "unknown")
  email=$(python3 -c "import json; d=json.load(open('$dir/Preferences')); print(d.get('account_info',[{}])[0].get('email','none'))" 2>/dev/null || echo "none")
  echo "$(basename "$dir")|$name|$email"
done
```

**Step 2: Ask the user which profile to use.**

Use `ask_user` with `mode: "select"` to present the discovered profiles. Show the profile name and email for each option.

**Step 3: Quit any running Chrome and relaunch with the selected profile + debugging.**

```bash
# Quit Chrome gracefully
osascript -e 'tell application "Google Chrome" to quit' 2>&1
sleep 3

# Launch with selected profile and remote debugging
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --profile-directory=<SELECTED_PROFILE_DIR> \
  --remote-debugging-port=9222 \
  &>/dev/null &

# Wait for Chrome to fully initialize
sleep 5
```

**Step 4: Verify the debug port is active.**

```bash
curl -s http://127.0.0.1:9222/json/version
```

If it responds with JSON → Chrome is ready with debugging. The `--autoConnect` MCP server should now be able to connect.

**Step 5: If the MCP tools are still not available** (because they're only loaded at CLI startup):

Tell the user:
> ⚠️ Chrome is now running with debugging enabled on your **<profile name>** profile.
> **Restart this CLI session** and re-run `/review-pr` — the MCP tools will connect automatically.

- **Stop the workflow.** Do NOT attempt agent-browser or HTTP fallback for private repos.

### 3b. Verify Page Access for Each PR URL

For each PR URL, verify the user is authenticated:

```
mcp__chrome-devtools__navigate_page { url: "<PR URL>" }
mcp__chrome-devtools__take_snapshot {}
```

Check the snapshot for login indicators: "Log in", "Sign in", "Repository not found", "Page not found", "Choose an account".

**If login required:**
1. Tell the user: "Please log in to Bitbucket in your Chrome browser, then confirm here."
2. Use `ask_user` to wait for confirmation.
3. Re-navigate to the same URL and re-snapshot.
4. If still showing login → repeat up to 2 more times, then skip this PR with an error.

**If accessible:**
- Proceed to Step 4 for this PR.

## Step 4: Review Each PR

For each accessible PR URL:

### 4a. Extract PR Metadata

Use `mcp__chrome-devtools__evaluate_script` to extract PR header info:

```
mcp__chrome-devtools__evaluate_script {
  function: "() => { const pr = {}; pr.title = document.querySelector('[data-qa=\"pr-header-title\"]')?.textContent?.trim() || document.title; pr.description = document.querySelector('[data-qa=\"pr-description\"]')?.textContent?.trim(); pr.author = document.querySelector('[data-qa=\"pr-author\"]')?.textContent?.trim(); pr.state = document.querySelector('[data-qa=\"pr-header-state\"]')?.textContent?.trim(); pr.branch = document.querySelector('[data-qa=\"pr-branch-name\"]')?.textContent?.trim(); const files = document.querySelectorAll('[data-qa=\"bk-filepath\"]'); pr.files = Array.from(files).map(f => f.textContent?.trim()); pr.fileCount = pr.files.length; return pr; }"
}
```

If metadata extraction returns mostly null/empty, fall back to generic extraction:
```
mcp__chrome-devtools__evaluate_script {
  function: "() => { return { title: document.title, body: document.body.innerText.substring(0, 80000) }; }"
}
```

### 4b. Navigate to Diff Tab

Ensure you're on the diff view. If the URL doesn't already end with `/diff`, navigate there:
```
mcp__chrome-devtools__navigate_page { url: "<PR URL>/diff" }
mcp__chrome-devtools__wait_for { text: ["diff", "changes", "modified"] }
```

### 4c. Extract Diff Content

Extract the diff content file-by-file:

```
mcp__chrome-devtools__evaluate_script {
  function: "() => { const diffs = document.querySelectorAll('.diff-container, [data-qa=\"pr-diff-file-container\"]'); return Array.from(diffs).map(d => ({ file: d.querySelector('[data-qa=\"bk-filepath\"], .filename')?.textContent?.trim(), additions: d.querySelectorAll('.addition, .udiff-line.addition').length, deletions: d.querySelectorAll('.deletion, .udiff-line.deletion').length, content: d.textContent?.substring(0, 10000) })); }"
}
```

### 4d. Handle Lazy-Loaded / Collapsed Diffs

Bitbucket lazy-loads diffs for large PRs. If the diff extraction returns fewer files than expected:

1. **Scroll to load more content:**
   ```
   mcp__chrome-devtools__evaluate_script {
     function: "() => { window.scrollTo(0, document.body.scrollHeight); return document.body.scrollHeight; }"
   }
   ```
   Wait 2 seconds, then re-extract.

2. **Expand collapsed files** — look for "Load diff" or expand buttons:
   ```
   mcp__chrome-devtools__evaluate_script {
     function: "() => { const btns = document.querySelectorAll('[data-qa=\"load-diff-button\"], button[aria-label*=\"expand\"]'); btns.forEach(b => b.click()); return btns.length; }"
   }
   ```
   Wait 2 seconds, then re-extract.

3. **Paginate** — if there are 20+ files, extract in batches by scrolling incrementally.

### 4e. Apply Review Rules

Apply all review rules from the profile:
- Flag TODO/FIXME/HACK markers in diff content
- Flag debug/logging statements that should be removed (console.log, print, debugger, etc.)
- Flag potential hardcoded secrets or credentials (API keys, tokens, passwords)
- Flag large PRs (20+ files) that should be split
- Flag missing or insufficient PR descriptions
- Flag unsafe patterns: force unwraps, unhandled errors, SQL injection vectors
- Apply any custom rules from the review profile

### 4f. Produce Structured Findings

For each finding, include:
- **severity**: critical, high, medium, or low
- **title**: Short description of the issue
- **filePath**: File path where the issue was found (REQUIRED by profile)
- **detail**: Full explanation of the issue
- **suggestion**: How to fix it (REQUIRED by profile)

Generate a summary verdict per PR:
- ✅ **Approve** — No critical or high issues, minor suggestions only
- ⚠️ **Approve with Comments** — Medium issues that should be addressed
- ❌ **Request Changes** — Critical or high issues that must be fixed

## Step 5: Generate Review Reports

After all PRs are reviewed, open the report viewer with the results:
```
show_pr_review_report {
  batch_title: "PR Review — <date>",
  reports: [
    {
      title: "<PR title>",
      url: "<PR URL>",
      summary: "<verdict>",
      profile_summary: ["<rule 1>", "<rule 2>", ...],
      findings: [
        { severity: "high", title: "...", filePath: "...", detail: "...", suggestion: "..." }
      ],
      metadata: { reviewedAt: "<now>", extractionMethod: "chrome-devtools-mcp" }
    }
  ]
}
```

The report viewer will:
- Show per-PR findings with severity badges
- Support tab navigation for multi-PR reviews
- Allow copying the report as markdown
- Persist reports for later browsing via `/reports`

## Important Notes

- **Chrome DevTools MCP is REQUIRED** for private Bitbucket repos. It connects to the user's real Chrome with their session cookies. Do NOT fall back to `agent-browser` — it is an isolated browser without authentication.
- Always use the saved review profile. Never skip profile loading.
- Generate one report entry per PR reviewed.
- Persist all reports so they appear in `/reports`.
- When extracting diff content, be aware of lazy-loading — scroll and expand collapsed diffs.
- If Chrome DevTools MCP is not connected, **stop and guide the user through setup** rather than attempting broken fallbacks.
