---
name: qa-scroll
description: >
  QA test skill for verifying scroll-based media feeds — video autoplay, scroll navigation,
  mute/unmute, and playback progression. Uses the CDP + agent-device dual-driver architecture.
  Works with any React Native app using expo-video or similar video player libraries.
  Invoke when user says "test scroll feed", "test video playback", "QA the feed",
  "verify video autoplay", "run scroll tests", "test media player", or any task
  requiring scroll-based media feed verification.
allowed-tools: Bash(agent-device:*) Bash(agent-browser:*) Bash(xcrun:*) Bash(node:*) Bash(curl:*) Bash(npx:*) Read
---

# qa-scroll

QA test skill for verifying scroll-based media feeds — **video autoplay**, **scroll navigation**, **mute/unmute toggle**, and **playback progression**. Uses the dual-driver architecture (CDP + agent-device) to test media feeds in native mobile apps.

## What It Tests

| Test | Method | Assertion |
|------|--------|-----------|
| First video autoplays | CDP player state query | `player.playing === true`, `currentTime > 0` |
| Video progress advances | CDP currentTime check after delay | `currentTime` increased between checks |
| Scroll to next video | CDP scroll hook or agent-device swipe | New video starts playing |
| Mute toggle | CDP `player.muted = !player.muted` | Mute state flips |
| Unmute toggle | CDP `player.muted = !player.muted` | Mute state flips back |
| Scroll continuity | Multiple swipes | Each new video autoplays |
| Final route check | CDP `cdp_get_route` | Still on the feed screen |

## Setup Guard (Automatic)

The skill includes a **setup guard** that runs before every test. It checks and auto-fixes:

| Check | What it does if missing |
|-------|------------------------|
| iOS Simulator booted | Boots it or auto-detects a booted one |
| Dev server running | Starts it in background, waits up to 60s |
| App in foreground | Launches via `xcrun simctl launch` |
| CDP target available | Polls `/json` endpoint for up to 30s |
| CDP connection functional | Sends `eval 1+1`, retries 3x |
| Navigation module ID valid | Auto-scans Metro modules with caching |
| Error overlay | Suppresses LogBox errors via CDP |

## Configuration

Before running, set your app-specific values in `qa.config.sh` or `qa.config.local.sh`:

```bash
# Required
export APP_BUNDLE_ID="com.yourapp.dev"
export PROJECT_DIR="/path/to/your/project"

# Video player (for expo-video apps)
export VIDEO_PLAYER_CLASS="VideoPlayer"     # Class to look for
export GLOBAL_PLAYERS_VAR="__qaVideoPlayers" # Global tracking variable

# Screen names (for CDP navigation)
export SCREEN_EXPLORE="ExploreScreen"       # Your feed screen name

# Optional: if your app has a feed scroll hook
export GLOBAL_FEED_VAR="__qaFeedState"      # Feed state debug hook name
```

## Test Result States

| Status | Meaning |
|--------|---------|
| **passed** | Assertion verified via CDP |
| **failed** | Assertion verified but wrong |
| **skipped** | CDP query inconclusive — cannot determine pass/fail |

## Architecture

```
CDP (Hermes Runtime)              agent-device (Simulator)
┌──────────────────────┐          ┌──────────────────────┐
│ navigate to tab      │          │ swipe up (scroll)     │
│ install debug hook   │          │ tap center (fallback) │
│ query player state   │          │ screenshot capture    │
│   .playing           │          │ appstate check        │
│   .muted             │          │                       │
│   .currentTime       │          │                       │
│ toggle mute via CDP  │          │                       │
│ dismiss error overlay│          │                       │
└──────────────────────┘          └──────────────────────┘
```

### Why CDP, not agent-browser?

`agent-browser` uses Playwright's CDP protocol which sends `Target.setDiscoverTargets` — a method Hermes doesn't support. Native apps don't have a DOM to interact with. Raw CDP via WebSocket to Hermes is the correct approach for JS runtime queries in React Native apps.

### Why agent-device, not agent-browser?

`agent-device` is purpose-built for iOS/Android simulator control — screenshots, swipe gestures, accessibility snapshots. `agent-browser` is for web pages. Native apps render native views, not web views.

## Usage

### Run the example test
```bash
bash skills/testing/qa-automation/qa-scroll/run.sh
```

### Run a specific flow
```bash
bash skills/testing/qa-automation/qa-scroll/flows/example-scroll-test.sh
```

### View results
- Screenshots: `/tmp/qa-tests/screenshots/<test-name>/`
- Report JSON: `/tmp/qa-tests/<test-name>-report.json`

## Customizing for Your App

### Step 1: Configure video player detection

The debug hook patches `VideoPlayer.prototype.play()` to track instances. If your app uses a different video player:

```bash
# In qa.config.sh:
export VIDEO_PLAYER_CLASS="MyVideoPlayer"  # Your player class name
```

The hook scans Metro modules looking for `module.default.VideoPlayer` or `module.VideoPlayer`. Adjust the scan in `scroll-helpers.sh` if your player is exported differently.

### Step 2: Configure feed scrolling

If your app exposes a scroll-to-next function via a debug hook:

```bash
# In your app code (dev builds only):
globalThis.__qaFeedState = {
    currentIndex: 0,
    scrollToNext: () => { /* scroll logic */ },
    scrollToIndex: (i) => { /* scroll to index */ },
    getData: () => { /* return feed data array */ },
    getItem: (i) => { /* return item at index */ }
};
```

If no hook is available, the skill falls back to `agent-device swipe` gestures.

### Step 3: Create your test flow

Copy `flows/example-scroll-test.sh` and customize the steps for your app's feed structure.

## File Structure

```
qa-scroll/
├── SKILL.md                          # This file
├── lib/
│   ├── setup-guard.sh                # Prerequisites checker + auto-fixer
│   └── scroll-helpers.sh             # Video state, mute control, feed interaction
├── flows/
│   └── example-scroll-test.sh        # Example test (customize for your app)
└── run.sh                            # Runner with JSON report output
```

## Troubleshooting

### "Setup guard failed"
Check the specific `[SETUP]` line that shows `FAILED`. Common causes:
- Simulator not installed or wrong UDID
- Dev server port in use by another process
- App not installed (build and install first)

### "No CDP target found"
The app needs to be connected to the dev server. After a fresh install, launch the app and wait for the connection.

### "VideoPlayer class not found"
The module scan didn't find your video player class. Check:
- Is the video player library installed? (`expo-video`, `react-native-video`, etc.)
- Does the class name match `VIDEO_PLAYER_CLASS` in config?
- Try widening the scan range: `export MODULE_SCAN_END=10000`

### Tests show "skipped"
CDP couldn't read player state. The debug hook may not have captured any players yet. Common causes:
- No video content loaded (API returned empty feed)
- Players created before hook was installed (hook captures on `play()` call)
- Video library doesn't use the expected class structure

### Error overlay appears
The setup guard suppresses LogBox, but errors during CDP eval may trigger new overlays. The test automatically checks for and dismisses overlays before screenshots.
