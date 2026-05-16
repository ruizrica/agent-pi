---
name: qa-browser
description: >
  QA test skill for web applications using agent-browser. Tests forms, navigation,
  responsive layouts, state persistence via cookies/localStorage, and visual regression.
  The web counterpart to agent-device — together they cover native + web testing.
  Invoke when user says "test the web app", "test localhost", "QA the website",
  "test the form", "verify responsive layout", "run web tests", "test browser",
  or any task requiring automated web application testing.
allowed-tools: Bash(agent-browser:*) Bash(node:*) Bash(curl:*) Read
---

# qa-browser

Web application QA testing using **agent-browser**. The web counterpart to agent-device — together they provide full coverage for apps with both native and web versions.

## When to Use

| Scenario | Tool |
|----------|------|
| Test native iOS/Android app | agent-device + CDP |
| Test web app / localhost | **agent-browser** (this skill) |
| Test React Native Web | **agent-browser** (this skill) |
| Test responsive layouts | **agent-browser** (this skill) |
| Test forms and navigation | **agent-browser** (this skill) |

## Core Workflow

Every web test follows the same pattern as native tests:

1. **Navigate**: `agent-browser open <url>`
2. **Snapshot**: `agent-browser snapshot -i` (get element refs)
3. **Interact**: Use refs to click, fill, select
4. **Re-snapshot**: After navigation/DOM changes, get fresh refs
5. **Assert**: Verify URL, text, element state

```bash
agent-browser open http://localhost:3000/login
agent-browser snapshot -i
# Output: @e1 [input type="email"], @e2 [input type="password"], @e3 [button] "Sign In"

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # Check result
```

## Configuration

Set web-specific values in `qa.config.sh`:

```bash
export WEB_BASE_URL="http://localhost:3000"   # Your web app URL
export WEB_SESSION="qa"                        # Browser session name
export WEB_VIEWPORT_WIDTH=1280                 # Default viewport
export WEB_VIEWPORT_HEIGHT=720
```

## Usage

### Run example web test
```bash
bash .pi/skills/qa-automation/qa-web/run.sh
```

### Run with headed browser (see what's happening)
```bash
export WEB_HEADED=true
bash .pi/skills/qa-automation/qa-web/flows/example-web-test.sh
```

## Helper Library — web-helpers.sh

Source this in your web test scripts for consistent patterns:

```bash
source .pi/skills/qa-automation/qa-web/lib/web-helpers.sh
```

### Available Functions

| Function | Purpose |
|----------|---------|
| `web_open "url"` | Navigate to URL |
| `web_snapshot` | Get interactive element refs |
| `web_click "ref_or_selector"` | Click element |
| `web_fill "ref" "text"` | Fill input field |
| `web_select "ref" "value"` | Select dropdown option |
| `web_wait "selector_or_ms"` | Wait for element/time |
| `web_screenshot "name"` | Screenshot with naming convention |
| `web_get_text "ref"` | Get element text |
| `web_get_url` | Get current URL |
| `web_get_title` | Get page title |
| `web_is_visible "ref"` | Check element visibility |
| `web_assert_url "pattern"` | Assert URL matches pattern |
| `web_assert_title "text"` | Assert page title |
| `web_assert_text "text"` | Assert text visible on page |
| `web_scroll "direction" [px]` | Scroll page |
| `web_save_state "file"` | Save cookies/storage |
| `web_load_state "file"` | Restore saved state |

## Test Patterns

### Form Testing

```bash
source web-helpers.sh

web_open "$WEB_BASE_URL/signup"
web_snapshot

web_fill @e1 "Jane Doe"
web_fill @e2 "jane@example.com"
web_fill @e3 "password123"
web_select @e4 "California"
web_click @e5  # Submit
web_wait --load networkidle

web_assert_url "**/dashboard"
web_assert_text "Welcome, Jane"
web_screenshot "signup-success"
```

### Navigation Testing

```bash
web_open "$WEB_BASE_URL"
web_snapshot

# Click nav links
web_click @e3  # "About" link
web_assert_url "**/about"
web_screenshot "about-page"

# Go back
agent-browser back
web_assert_url "**/"
```

### Responsive Testing

```bash
# Desktop
agent-browser set viewport 1440 900
web_open "$WEB_BASE_URL"
web_screenshot "desktop-home"

# Tablet
agent-browser set viewport 768 1024
web_screenshot "tablet-home"

# Mobile
agent-browser set viewport 375 812
web_screenshot "mobile-home"
```

### State Persistence (Cookies/Storage)

```bash
# Login and save state
web_open "$WEB_BASE_URL/login"
web_fill @e1 "user@example.com"
web_fill @e2 "password"
web_click @e3
web_wait --load networkidle
web_save_state "/tmp/qa-auth-state.json"

# Reuse in future tests
web_load_state "/tmp/qa-auth-state.json"
web_open "$WEB_BASE_URL/dashboard"
web_assert_text "Welcome"  # Still logged in
```

### Accessibility Testing

```bash
web_open "$WEB_BASE_URL"
agent-browser snapshot  # Full a11y tree
agent-browser screenshot --full /tmp/qa-full-page.png
```

## File Structure

```
qa-web/
├── SKILL.md                    # This file
├── lib/
│   └── web-helpers.sh          # Web test helper functions
├── flows/
│   └── example-web-test.sh     # Example test
└── run.sh                      # Runner
```

## Integration with Native Tests

For apps with both native and web versions, use both tools in the same test run:

```bash
# Test native app
bash .pi/skills/qa-automation/qa-scroll/run.sh

# Test web app
bash .pi/skills/qa-automation/qa-web/run.sh

# Both results in /tmp/qa-tests/
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "agent-browser: command not found" | Install: `npm install -g agent-browser` |
| Browser launches but page is blank | Check URL and dev server: `curl $WEB_BASE_URL` |
| Refs invalidated after click | Always re-snapshot after navigation/DOM changes |
| Can't access localhost | agent-browser runs locally — it CAN access localhost (unlike web_remote) |
| Headed mode not showing | Set `export WEB_HEADED=true` before running |
