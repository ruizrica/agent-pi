---
name: qa-device-management
description: >
  Boot and control iOS Simulators and Android Emulators for QA testing using agent-device CLI.
  Manage sessions, capture screenshots, launch apps, and control devices across platforms.
  Invoke when user says "bring up simulators", "boot the device", "take a screenshot",
  "launch the app", "compare iOS and Android", "test both platforms", "visual parity check",
  or any task requiring device/simulator lifecycle management.
allowed-tools: Bash(agent-device:*) Bash(xcrun:*) Bash(adb:*) Bash(open:*) Bash(find:*) Bash(npx:*) Read
---

# qa-device-management

Side-by-side iOS Simulator and Android Emulator control using the `agent-device` CLI. Manages the device lifecycle for all QA Automation skills.

## When to Use

- Bringing up simulators/emulators for testing
- Launching your app on one or both platforms
- Capturing baseline or comparison screenshots
- Checking device state, app state, or accessibility tree
- Managing agent-device sessions across platforms

## Configuration

All device settings are in `qa.config.sh`. Set these before using:

```bash
# In qa.config.sh or qa.config.local.sh:
export APP_BUNDLE_ID="com.yourapp.dev"          # Your app's bundle/package ID
export SIMULATOR_UDID="auto"                      # "auto" or specific UDID
export SIMULATOR_DEVICE_NAME="iPhone 16 Pro"      # For creating simulators
export ANDROID_AVD="Pixel_8"                       # Android AVD name
export ANDROID_SERIAL="emulator-5554"              # Android serial
```

## Quick Start — Full Startup Sequence

### Boot iOS Simulator

```bash
# Auto-detect a booted simulator, or boot one
source skills/testing/qa-automation/qa.config.sh
UDID=$(qa_detect_simulator_udid)

# Or boot a specific one
xcrun simctl boot "$SIMULATOR_UDID" 2>&1 || true
open -a Simulator
```

### Boot Android Emulator

```bash
nohup $EMULATOR_PATH -avd "$ANDROID_AVD" -no-snapshot-load > /tmp/qa-emu.log 2>&1 &

# Wait for boot
for i in $(seq 1 30); do
    BOOT=$($ADB_PATH shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    if [ "$BOOT" = "1" ]; then
        echo "Android emulator booted after ~$((i*2))s"
        break
    fi
    sleep 2
done
```

### Verify Both Devices

```bash
agent-device devices --json
```

### Launch App on iOS

```bash
agent-device open "$APP_BUNDLE_ID" --platform ios --session default
```

### Launch App on Android

```bash
agent-device open "$APP_BUNDLE_ID" --platform android --serial "$ANDROID_SERIAL" --session android
```

### Capture Baseline Screenshots

```bash
agent-device screenshot /tmp/qa-ios-baseline.png --session default
agent-device screenshot /tmp/qa-android-baseline.png --session android
```

## Session Management

agent-device binds each session to one platform. Use the correct session flag:

| Platform | Session Flag | Example |
|----------|-------------|---------|
| iOS | `--session default` (or omit) | `agent-device snapshot --session default` |
| Android | `--session android` | `agent-device snapshot --session android` |

```bash
# List active sessions
agent-device session list

# Release a session
agent-device close --session default
```

## Common Operations

### Screenshots (Both Platforms)

```bash
agent-device screenshot /tmp/qa-ios.png --session default
agent-device screenshot /tmp/qa-android.png --session android
```

### Accessibility Snapshots

```bash
agent-device snapshot --session default      # iOS
agent-device snapshot --session android      # Android

# With options
agent-device snapshot -i --session default   # Interactive elements only
agent-device snapshot --depth 3              # Limit depth
```

### Navigate and Interact

```bash
# Tap
agent-device click 200 400 --session default

# Swipe
agent-device swipe 200 800 200 200 --session default

# Scroll
agent-device scroll down --session default

# Type
agent-device fill @e3 "hello world" --session default
```

### Go Home / Go Back

```bash
agent-device home --session default
agent-device back --session android
```

### Check Foreground App

```bash
agent-device appstate --session default
agent-device appstate --session android
```

### Relaunch App (Fresh State)

```bash
agent-device open "$APP_BUNDLE_ID" --session default --relaunch
```

## Building and Installing Your App

### iOS — Expo

```bash
cd "$PROJECT_DIR"
npx expo run:ios --device "$SIMULATOR_DEVICE_NAME"
```

### iOS — React Native CLI

```bash
cd "$PROJECT_DIR"
npx react-native run-ios --simulator "$SIMULATOR_DEVICE_NAME"
```

### Android — Expo

```bash
cd "$PROJECT_DIR"
npx expo run:android
```

### Android — React Native CLI

```bash
cd "$PROJECT_DIR"
npx react-native run-android
```

### Check If App Is Installed

```bash
# iOS
xcrun simctl listapps booted 2>/dev/null | grep "$APP_BUNDLE_ID"

# Android
$ADB_PATH shell pm list packages | grep "$APP_BUNDLE_ID"
```

## Shutdown Sequence

```bash
# Close agent-device sessions
agent-device close --session default
agent-device close --session android

# Shutdown simulators
xcrun simctl shutdown "$SIMULATOR_UDID"
$ADB_PATH emu kill
```

## CDP Connection (for React Native apps)

When coordinate-based tapping fails (e.g., full-screen video players intercept touches), use CDP to control navigation directly via the React Native Hermes runtime.

### Prerequisites
- Dev server running (e.g., `npx expo start`)
- `ws` npm package available

### Discover CDP Endpoints

```bash
# List available debug targets
curl -s http://localhost:$METRO_PORT/json

# Get WebSocket URL (auto-detected by qa.config.sh)
source qa.config.sh
qa_detect_cdp_ws_url
```

### Navigate via CDP

```bash
source skills/testing/qa-automation/qa-test-flows/lib/cdp-helpers.sh

# Navigate to a screen
cdp_navigate "SettingsScreen"

# Navigate to a tab
cdp_navigate_tab "ProfileScreen"

# Get current route
cdp_get_route
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No device found" | Verify simulator is booted: `xcrun simctl list devices \| grep Booted` |
| Session bound to wrong platform | Use `--session android` for Android, close session and rebind |
| Simulator already booted (error 149) | Safe to ignore — simulator is already running |
| App not installed | Build and install: `npx expo run:ios` or `npx expo run:android` |
| agent-device click hangs | Wrap with timeout: `timeout 5 agent-device click 100 200` |
| CDP "Connection refused" | Ensure dev server is running: `curl http://localhost:$METRO_PORT/status` |
