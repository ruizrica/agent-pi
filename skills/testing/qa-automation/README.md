# QA Automation Skills

A comprehensive, reusable QA automation skill package for AI coding agents. Tests native mobile apps (iOS/Android) and web applications using a **dual-driver architecture**: **agent-device** for native simulator control + **CDP** for React Native runtime inspection, and **agent-browser** for web app testing.

## Quick Start

### 1. Install Dependencies

```bash
bash install.sh
```

This checks and installs: `agent-device`, `agent-browser`, `node`, `ws`, and verifies `xcrun` (iOS) and `adb` (Android).

### 2. Configure for Your App

Edit `qa.config.sh` or create `qa.config.local.sh`:

```bash
# Required — your app's identifiers
export APP_BUNDLE_ID="com.yourapp.dev"
export PROJECT_DIR="/path/to/your/project"

# Navigation screens (for CDP)
export SCREEN_EXPLORE="FeedScreen"
export SCREEN_SEARCH="SearchScreen"
export SCREEN_PROFILE="ProfileScreen"
export SCREEN_SETTINGS="SettingsScreen"

# Web app (for agent-browser tests)
export WEB_BASE_URL="http://localhost:3000"
```

### 3. Run a Test

```bash
# Native app — scroll test
bash qa-scroll/run.sh

# Native app — state persistence test
bash qa-state-persistence/run.sh

# Web app test
bash qa-browser/run.sh

# All test flows
bash qa-test-flows/run-all.sh
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     QA Automation Skills                         │
├────────────────────────────┬────────────────────────────────────┤
│     Native App Testing     │        Web App Testing             │
│                            │                                     │
│  ┌────────────────────┐    │    ┌────────────────────┐          │
│  │   agent-device      │    │    │   agent-browser     │          │
│  │   • Screenshots     │    │    │   • Screenshots     │          │
│  │   • Tap / Swipe     │    │    │   • Click / Fill    │          │
│  │   • A11y Snapshots  │    │    │   • A11y Snapshots  │          │
│  │   • App Lifecycle   │    │    │   • Navigation      │          │
│  └─────────┬──────────┘    │    └─────────┬──────────┘          │
│            │               │              │                      │
│  ┌─────────▼──────────┐    │    ┌─────────▼──────────┐          │
│  │   CDP (Hermes)      │    │    │   Browser DOM       │          │
│  │   • JS Evaluation   │    │    │   • JS Evaluation   │          │
│  │   • Navigation      │    │    │   • State Check     │          │
│  │   • State Query     │    │    │   • Cookie/Storage  │          │
│  │   • Debug Hooks     │    │    │   • Network         │          │
│  └────────────────────┘    │    └────────────────────┘          │
└────────────────────────────┴────────────────────────────────────┘
```

## Skills Overview

| Skill | Purpose | Tools Used |
|-------|---------|------------|
| **qa-setup** | Verify/install all dependencies | npm, node |
| **qa-device-management** | Boot simulators, launch apps, manage sessions | agent-device, xcrun, adb |
| **qa-test-flows** | Core test framework + example flows | agent-device, CDP |
| **qa-scroll** | Scroll-based media feed testing (autoplay, mute, progress) | agent-device, CDP |
| **qa-state-persistence** | UI state persistence across navigation | agent-device, CDP |
| **qa-browser** | Web application testing (forms, navigation, responsive) | agent-browser |

## Package Structure

```
qa-automation/
├── README.md                          ← You are here
├── install.sh                         ← Dependency checker & installer
├── qa.config.sh                       ← Central configuration
│
├── qa-setup/
│   └── SKILL.md                       ← Setup verification skill
│
├── qa-device-management/
│   ├── SKILL.md                       ← Simulator/emulator management
│   └── COORDINATE-MAP.md             ← Template for tap target coordinates
│
├── qa-test-flows/
│   ├── SKILL.md                       ← Test framework documentation
│   ├── lib/
│   │   ├── test-helpers.sh            ← Core: lifecycle, logging, assertions
│   │   └── cdp-helpers.sh            ← Core: CDP eval, navigation, state
│   ├── flows/
│   │   └── smoke/
│   │       └── example-smoke.sh       ← Example smoke test
│   ├── templates/
│   │   └── new-flow.sh.template      ← Template for new tests
│   └── run-all.sh                     ← Master test runner
│
├── qa-scroll/
│   ├── SKILL.md                       ← Scroll/media test documentation
│   ├── lib/
│   │   ├── setup-guard.sh            ← Prerequisites auto-checker
│   │   └── scroll-helpers.sh         ← Video state, mute, feed scroll
│   ├── flows/
│   │   └── example-scroll-test.sh    ← Example scroll test
│   └── run.sh                         ← Scroll test runner
│
├── qa-state-persistence/
│   ├── SKILL.md                       ← State persistence documentation
│   ├── lib/
│   │   └── state-helpers.sh          ← State query, mutation, assertions
│   ├── flows/
│   │   └── example-state-test.sh     ← Example state test
│   └── run.sh                         ← State test runner
│
└── qa-browser/
    ├── SKILL.md                       ← Web testing documentation
    ├── lib/
    │   └── web-helpers.sh            ← Web: open, click, fill, assert
    ├── flows/
    │   └── example-web-test.sh       ← Example web test
    └── run.sh                         ← Web test runner
```

## Configuration Reference

All configuration lives in `qa.config.sh`. Override any variable by exporting it before sourcing, or create `qa.config.local.sh` (automatically loaded, gitignored).

### App Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_BUNDLE_ID` | `com.example.app.dev` | Bundle/package ID for dev builds |
| `APP_BUNDLE_ID_PROD` | `com.example.app` | Bundle/package ID for production |
| `PROJECT_DIR` | `$(pwd)` | Project root (where package.json is) |

### iOS Simulator

| Variable | Default | Description |
|----------|---------|-------------|
| `SIMULATOR_UDID` | `auto` | `"auto"` to detect, or specific UDID |
| `SIMULATOR_DEVICE_NAME` | `iPhone 16 Pro` | Device name for creating simulators |

### Android Emulator

| Variable | Default | Description |
|----------|---------|-------------|
| `ANDROID_AVD` | `Pixel_8` | AVD name |
| `ANDROID_SERIAL` | `emulator-5554` | Serial for ADB |

### Dev Server

| Variable | Default | Description |
|----------|---------|-------------|
| `METRO_PORT` | `8081` | Dev server port |
| `DEV_SERVER_CMD` | `npx expo start --port $METRO_PORT` | Command to start dev server |
| `DEV_SERVER_HEALTH` | `http://localhost:$METRO_PORT/status` | Health check endpoint |

### CDP

| Variable | Default | Description |
|----------|---------|-------------|
| `CDP_WS_URL` | `auto` | `"auto"` for auto-discovery, or explicit URL |
| `MODULE_SCAN_START` | `0` | Start of module ID scan range |
| `MODULE_SCAN_END` | `5000` | End of module ID scan range |

### Screen Names

| Variable | Default | Description |
|----------|---------|-------------|
| `SCREEN_HOME` | `HomeScreen` | Home screen name |
| `SCREEN_EXPLORE` | `ExploreScreen` | Explore/feed screen name |
| `SCREEN_SEARCH` | `SearchScreen` | Search screen name |
| `SCREEN_PROFILE` | `ProfileScreen` | Profile screen name |
| `SCREEN_SETTINGS` | `SettingsScreen` | Settings screen name |
| `TAB_NAVIGATOR_NAME` | `BottomTab` | Tab navigator component name |

### Video/Media

| Variable | Default | Description |
|----------|---------|-------------|
| `VIDEO_PLAYER_CLASS` | `VideoPlayer` | Video player class name to patch |
| `GLOBAL_PLAYERS_VAR` | `__qaVideoPlayers` | Global var for tracking players |
| `GLOBAL_FEED_VAR` | `__qaFeedState` | Global var for feed debug hook |

### State Persistence

| Variable | Default | Description |
|----------|---------|-------------|
| `STATE_PROPERTY` | `isLiked` | Property to test (e.g., isLiked, isBookmarked) |
| `STATE_COUNTER_PROPERTY` | `likesCount` | Associated counter property |
| `STATE_SCROLL_COUNT` | `5` | Items to scroll past before checking |

### Web Testing

| Variable | Default | Description |
|----------|---------|-------------|
| `WEB_BASE_URL` | `http://localhost:3000` | Web app URL |
| `WEB_SESSION` | `qa` | Browser session name |
| `WEB_VIEWPORT_WIDTH` | `1280` | Default viewport width |
| `WEB_VIEWPORT_HEIGHT` | `720` | Default viewport height |

## Setup Guard

The setup guard (`qa-scroll/lib/setup-guard.sh`) runs automatically before scroll and state tests. It checks 7 prerequisites in order and auto-fixes what it can:

1. ✅ iOS Simulator booted (boots one if needed)
2. ✅ Dev server running (starts it in background)
3. ✅ App in foreground (launches it)
4. ✅ CDP Hermes target available (polls with timeout)
5. ✅ CDP connection functional (eval 1+1)
6. ✅ Navigation module ID valid (auto-scans with caching)
7. ✅ Error overlay dismissed (suppresses LogBox)

## Creating Custom Tests

1. **Copy the template**: `cp qa-test-flows/templates/new-flow.sh.template qa-test-flows/flows/my-suite/my-test.sh`
2. **Edit**: Replace `CUSTOMIZE` markers with your app details
3. **Run**: `bash qa-test-flows/flows/my-suite/my-test.sh`
4. **Review**: Check screenshots in `/tmp/qa-tests/screenshots/`

For detailed patterns (form testing, auth flows, responsive testing), see the individual skill SKILL.md files.

## Exposing Debug Hooks (for React Native apps)

For the scroll and state tests to read runtime data via CDP, your app needs to expose debug hooks in dev builds:

```javascript
// In your feed component (e.g., ExploreFeed.tsx):
if (__DEV__) {
  globalThis.__qaFeedState = {
    currentIndex: currentIndex,
    scrollToNext: () => flatListRef.current?.scrollToIndex({ index: currentIndex + 1 }),
    scrollToIndex: (i) => flatListRef.current?.scrollToIndex({ index: i }),
    getData: () => feedData,
    getItem: (i) => feedData[i],
    dataLength: feedData.length,
  };
}
```

The video player debug hook is installed automatically via CDP — it patches `VideoPlayer.prototype.play()` to track instances. No app code changes needed for video state testing.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `agent-device: not found` | Run `bash install.sh` or `npm install -g agent-device` |
| `agent-browser: not found` | Run `bash install.sh` or `npm install -g agent-browser` |
| Setup guard fails | Check the `[SETUP]` line that says FAILED for details |
| CDP timeout | Verify dev server: `curl http://localhost:$METRO_PORT/status` |
| No video players tracked | Ensure the video player library uses the class name in `VIDEO_PLAYER_CLASS` |
| State test inconclusive | Ensure your feed component exposes `__qaFeedState` debug hook |
| Web test can't access localhost | agent-browser runs locally — check your dev server is running |
