# Slack Web Automation — Detailed Workflows

## URL Patterns

```
https://app.slack.com/client/{WORKSPACE_ID}/{CHANNEL_ID}  — Channel
https://app.slack.com/client/{WORKSPACE_ID}/{DM_ID}       — Direct message
https://app.slack.com/client/{WORKSPACE_ID}/threads        — All threads
https://app.slack.com/client/{WORKSPACE_ID}/activity       — Activity/mentions
https://app.slack.com/client/{WORKSPACE_ID}/unreads        — Unreads
https://app.slack.com/client/{WORKSPACE_ID}/search         — Search
```

## Complete Workflow: Morning Slack Check

```bash
# 1. Restore session
agent-browser state load ~/.slack-auth-state.json
agent-browser --headed open "https://app.slack.com"
agent-browser wait --load networkidle
agent-browser set viewport 1920 1080

# 2. Verify logged in
agent-browser get url

# 3. Check unreads — snapshot sidebar for bold channels
agent-browser snapshot -i -c

# 4. For each unread channel, navigate and read
agent-browser press "Meta+k"
agent-browser wait 500
agent-browser snapshot -i
agent-browser fill @eXX "channel-name"
agent-browser wait 1000
agent-browser snapshot -i
agent-browser click @eXX
agent-browser wait --load networkidle
agent-browser snapshot -c

# 5. Reply if needed
agent-browser snapshot -i
agent-browser click @eXX  # compose box
agent-browser type @eXX "Response message"
agent-browser press "Enter"
```

## Complete Workflow: Send Message to Multiple Channels

```bash
# For each channel:
agent-browser press "Meta+k"
agent-browser wait 500
agent-browser snapshot -i
agent-browser fill @eXX "channel-name"
agent-browser wait 1000
agent-browser snapshot -i
agent-browser click @eXX
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser click @eXX  # compose box
agent-browser type @eXX "Announcement message"
agent-browser press "Enter"
agent-browser wait 1000
```

## Handling Multi-line Messages

```bash
agent-browser snapshot -i
agent-browser click @eXX  # compose box
agent-browser type @eXX "Line one"
agent-browser press "Shift+Enter"  # newline without sending
agent-browser type @eXX "Line two"
agent-browser press "Shift+Enter"
agent-browser type @eXX "Line three"
agent-browser press "Enter"  # send
```

## Scrolling Through History

```bash
# Scroll up to load older messages
agent-browser scroll up 500
agent-browser wait 1000
agent-browser snapshot -c

# Keep scrolling for more history
agent-browser scroll up 500
agent-browser wait 1000
agent-browser snapshot -c
```

## Error Recovery Table

| Problem | Solution |
|---------|----------|
| Refs don't match | Re-snapshot: `agent-browser snapshot -i -c` |
| Page not loading | `agent-browser wait --load networkidle` then retry |
| Session expired | User re-login manually → `state save` |
| Can't find compose box | `agent-browser find role textbox` or click message area |
| Emoji picker won't open | Hover message first, wait 500ms, then snapshot |
| Thread panel not visible | `agent-browser set viewport 1920 1080` |
| Wrong channel | `Meta+k` quick switcher to navigate |
| Message not sending | Try `agent-browser press "Enter"` separately after typing |
