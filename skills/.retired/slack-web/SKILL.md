---
name: slack-web
description: >
  Slack web automation via agent-browser. Use when the user asks to check Slack,
  read messages, send messages, reply in threads, search Slack, check notifications,
  react to messages, send DMs, or any Slack communication task. Triggers include
  "check my Slack", "send a message on Slack", "reply to that Slack thread",
  "search Slack for...", "what's new on Slack", "read my DMs", "react to that message",
  "check Slack notifications", "message [person] on Slack".
allowed-tools: Bash(agent-browser:*)
---

# Slack Web Automation

Interact with Slack through its web interface using `agent-browser`.

## Core Workflow

Every Slack interaction follows this pattern:

1. **Restore session**: `agent-browser state load ~/.slack-auth-state.json`
2. **Open Slack**: `agent-browser --headed open "https://app.slack.com"`
3. **Snapshot**: `agent-browser snapshot -i -c` (get refs)
4. **Interact**: Use refs to click, type, navigate
5. **Re-snapshot**: After every action — Slack's DOM changes constantly

```bash
# Restore and open
agent-browser state load ~/.slack-auth-state.json
agent-browser --headed open "https://app.slack.com"
agent-browser wait --load networkidle
agent-browser set viewport 1920 1080

# Verify logged in (URL should contain /client/)
agent-browser get url

# Navigate with quick switcher
agent-browser press "Meta+k"
agent-browser wait 500
agent-browser snapshot -i
agent-browser fill @eXX "general"
agent-browser wait 1000
agent-browser snapshot -i
agent-browser click @eXX
agent-browser wait --load networkidle

# Read messages
agent-browser snapshot -c
```

## Authentication

### First-Time Login (Manual)

```bash
agent-browser --headed open "https://app.slack.com"
# PAUSE — tell user to log in manually
# After login confirmed:
agent-browser get url  # verify /client/ in URL
agent-browser state save ~/.slack-auth-state.json
```

### Restore Session

```bash
agent-browser state load ~/.slack-auth-state.json
agent-browser --headed open "https://app.slack.com"
agent-browser wait --load networkidle
agent-browser get url
# If URL contains "signin" → session expired, user must re-login
```

## Actions

### Read Messages

```bash
# Navigate to channel (quick switcher is fastest)
agent-browser press "Meta+k"
agent-browser wait 500
agent-browser snapshot -i
agent-browser fill @eXX "channel-name"
agent-browser wait 1000
agent-browser snapshot -i
agent-browser click @eXX
agent-browser wait --load networkidle

# Read
agent-browser snapshot -c
```

### Send a Message

```bash
# In the target channel, find compose box
agent-browser snapshot -i
# Look for textbox with "Message #channel" placeholder
agent-browser click @eXX  # compose area
agent-browser type @eXX "Your message"
agent-browser press "Enter"
agent-browser wait 1000
agent-browser snapshot -c  # verify sent
```

Use `type` not `fill` — Slack's compose box is contenteditable.

### Reply to Thread

```bash
agent-browser snapshot -c
agent-browser hover @eXX  # hover message to show toolbar
agent-browser snapshot -i
agent-browser click @eXX  # reply/thread button
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser click @eXX  # thread compose box
agent-browser type @eXX "Thread reply"
agent-browser press "Enter"
```

### Send DM

```bash
agent-browser press "Meta+k"
agent-browser wait 500
agent-browser snapshot -i
agent-browser fill @eXX "Person Name"
agent-browser wait 1000
agent-browser snapshot -i
agent-browser click @eXX  # person result
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser click @eXX  # compose box
agent-browser type @eXX "Your DM"
agent-browser press "Enter"
```

### Search

```bash
agent-browser press "Meta+g"  # Slack search
agent-browser wait 500
agent-browser snapshot -i
agent-browser fill @eXX "search query"
agent-browser press "Enter"
agent-browser wait --load networkidle
agent-browser snapshot -c
```

### React with Emoji

```bash
agent-browser snapshot -c
agent-browser hover @eXX  # hover over message
agent-browser snapshot -i
agent-browser click @eXX  # emoji/reaction button (smiley icon)
agent-browser wait 500
agent-browser snapshot -i
agent-browser fill @eXX "thumbsup"  # emoji search
agent-browser wait 500
agent-browser snapshot -i
agent-browser click @eXX  # emoji result
```

### Check Notifications

```bash
# Click "Activity" in sidebar or navigate:
agent-browser snapshot -i -c
agent-browser click @eXX  # Activity link
agent-browser wait --load networkidle
agent-browser snapshot -c
```

### Check Unreads

```bash
agent-browser snapshot -i -c
# Look for bold channel names or "Unreads" section
agent-browser click @eXX  # Unreads link
agent-browser wait --load networkidle
agent-browser snapshot -c
```

## Critical Rules

1. **ALWAYS re-snapshot** after every action — refs invalidate constantly
2. **Use `--headed`** mode so user can see and intervene
3. **Set viewport 1920x1080** — Slack hides features at small widths
4. **Use `Meta+k`** (quick switcher) as primary navigation
5. **Use `type` not `fill`** for compose boxes (contenteditable)
6. **Wait after actions**: `agent-browser wait --load networkidle`
7. **Save auth state often**: `agent-browser state save ~/.slack-auth-state.json`

## Semantic Locator Fallbacks

When refs don't match:

```bash
agent-browser find text "general" click
agent-browser find role textbox fill "Hello"
agent-browser find placeholder "Message #general" type "Hello"
agent-browser find role button click --name "Send"
```

## Debugging

```bash
agent-browser screenshot /tmp/slack-debug.png
agent-browser get url
agent-browser snapshot  # full unfiltered tree
```

## Deep-Dive References

| Reference | When to Use |
|-----------|-------------|
| [references/workflows.md](references/workflows.md) | Full workflow examples |
