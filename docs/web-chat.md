# Web Chat — Remote Access to Pi from Any Device

The Web Chat extension lets you interact with your Pi session from your phone, tablet, or any device on the network. Messages sent from the chat UI are relayed directly into the running Pi session — same conversation, same tools, same subagents.

## Quick Start

```
/chat              # Open local chat (LAN only)
/chat --remote     # Open with Cloudflare tunnel (accessible from anywhere)
/chat stop         # Shut down the server
```

Or use the tool programmatically:
```
show_chat {}       # Equivalent to /chat
```

## How It Works

### Local Mode (`/chat`)

1. Starts an HTTP + WebSocket server on `0.0.0.0` (all interfaces) with an auto-assigned port
2. Opens the chat UI in your desktop browser automatically
3. Displays the LAN URL and a 6-digit PIN for phone access
4. Any device on the same network can connect via the LAN IP

```
  http://192.168.1.42:54321
  PIN: 847291
```

### Remote Mode (`/chat --remote`)

1. Starts the same local server as above
2. Launches a [Cloudflare Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) (`cloudflared tunnel`) that creates a secure HTTPS URL accessible from anywhere on the internet
3. Displays a QR code in the terminal for easy phone scanning
4. The tunnel URL looks like: `https://random-words.trycloudflare.com`

**Requirements:** `cloudflared` must be installed:
```bash
brew install cloudflared       # macOS
sudo apt install cloudflared   # Linux
```

No Cloudflare account is needed — Quick Tunnels are free and ephemeral.

## Security

- **PIN Authentication** — A random 6-digit PIN is generated each time the server starts. The phone must enter this PIN before gaining access.
- **Single-User Lock** — Only one device can be authenticated at a time. A new PIN entry revokes the previous session.
- **Token-Based Sessions** — After PIN verification, an HTTP-only cookie token is issued. WebSocket connections also require the token.
- **Auto-Shutdown** — The server automatically shuts down after 2 minutes of no connected clients.
- **Process Cleanup** — The server and tunnel are killed when the Pi session ends, when you run `/chat stop`, or on SIGINT/SIGTERM.

## Architecture

```
Phone/Browser ──WebSocket──► HTTP Server (0.0.0.0:PORT)
                                  │
                                  ▼
                            SessionBridge
                                  │
                            pi.sendUserMessage()
                                  │
                                  ▼
                          Main Pi Session
                          (same tools, same context)
```

The phone acts as a **thin client**. It sends text messages via WebSocket, and receives:
- `text_delta` — streaming response tokens
- `assistant_message` — complete response at message end
- `tool_start` / `tool_end` — tool execution notifications
- `subagent_start` — subagent spawn notifications
- `terminal_output` — activity feed (visible in the Terminal tab)
- `status` — busy/idle state changes

### Key Design Decisions

1. **Relay, not subprocess** — Messages are injected into the main Pi session via `pi.sendUserMessage()`, not spawned as separate subagent processes. This means the phone has full access to the same conversation context, tools, and subagents.

2. **WebSocket over SSE** — The initial implementation used Server-Sent Events, but WebSocket provides more reliable streaming through Cloudflare tunnels (SSE had buffering issues with `cloudflared`).

3. **No state on the server** — The chat UI fetches history on connect and receives all updates via WebSocket. The server holds conversation history in memory only for the session duration.

## Chat UI Features

- **Mobile-first responsive design** — Optimized for phone screens, works on desktop too
- **Dark blue theme** — Matches Pi's visual style
- **Markdown rendering** — Assistant responses are rendered with code blocks, lists, etc.
- **Tool call indicators** — Shows when Pi is calling tools (Read, Bash, etc.)
- **Subagent visibility** — Notifies when subagents are spawned
- **Terminal tab** — Live activity feed showing tool calls, agent status, and events
- **Auto-scroll** — Automatically follows new messages
- **Typing indicator** — Shows streaming progress while Pi is responding
- **Slash command menu** — Type `/` to see available commands

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `cloudflared is not installed` | Run `brew install cloudflared` |
| QR code is cut off in terminal | Widen your terminal window |
| Phone can't connect (LAN mode) | Ensure phone is on the same Wi-Fi network |
| Messages not reaching Pi | Check that `/chat stop` wasn't called; restart with `/chat` |
| Tunnel URL not working | `cloudflared` may have timed out; restart with `/chat --remote` |
| "Agent is busy" error | Wait for the current response to finish before sending another message |
