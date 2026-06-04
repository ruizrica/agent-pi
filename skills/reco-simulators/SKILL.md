---
name: reco-simulators
description: Public, configurable simulator setup notes for Reco QA automation. Use when booting iOS/Android devices, checking agent-device sessions, capturing screenshots, or preparing the Reco app before pre-release QA.
allowed-tools: Bash(agent-device:*) Bash(xcrun:*) Bash(adb:*) Bash(open:*) Bash(npx:*) Read
---

# Reco Simulators

Public simulator workflow for Reco QA. Keep machine-specific values in local environment variables or private overrides.

## Environment Variables

| Variable | Example | Purpose |
| --- | --- | --- |
| `RECO_PROJECT_DIR` | `/path/to/reco` | Reco checkout root |
| `RECO_MOBILE_DIR` | `/path/to/reco/mobile` | Mobile app working directory |
| `IOS_SIMULATOR_UDID` | `auto` or a simulator UDID | iOS target |
| `IOS_DEVICE_NAME` | `iPhone 17 Pro` | Human-readable iOS simulator name |
| `ANDROID_SERIAL` | `auto` or `emulator-5554` | Android target |
| `ANDROID_AVD_NAME` | `Pixel_9a` | Android emulator name |
| `IOS_AGENT_SESSION` | `default` | agent-device iOS session |
| `ANDROID_AGENT_SESSION` | `android` | agent-device Android session |
| `APP_BUNDLE_ID` | `com.recoapp.dev` | Dev app bundle/package |

## Boot Devices

```bash
# iOS
xcrun simctl boot "${IOS_SIMULATOR_UDID:-booted}" 2>/dev/null || true
open -a Simulator

# Android
emulator_bin="${ANDROID_EMULATOR_BIN:-$HOME/Library/Android/sdk/emulator/emulator}"
"$emulator_bin" -avd "${ANDROID_AVD_NAME:?Set ANDROID_AVD_NAME}" -no-snapshot-load >/tmp/reco-android-emulator.log 2>&1 &
```

## Verify Sessions

```bash
agent-device devices --json
agent-device appstate --session "${IOS_AGENT_SESSION:-default}"
agent-device appstate --session "${ANDROID_AGENT_SESSION:-android}"
```

## Build / Launch

```bash
cd "${RECO_PROJECT_DIR:?Set RECO_PROJECT_DIR}"
npx expo run:ios --device "${IOS_DEVICE_NAME:-iPhone}" --bundle-identifier "${APP_BUNDLE_ID:-com.recoapp.dev}"
npx expo run:android --device "${ANDROID_SERIAL:-emulator-5554}"
```

## Capture Baselines

```bash
agent-device screenshot /tmp/reco-ios-baseline.png --session "${IOS_AGENT_SESSION:-default}"
agent-device screenshot /tmp/reco-android-baseline.png --session "${ANDROID_AGENT_SESSION:-android}"
```

## Notes

- This public skill deliberately avoids hardcoded personal UDIDs, serials, and paths.
- Store exact local values in shell profiles, `.env`, or private skill overrides.
- The QA Reco pre-release runner writes evidence under `/tmp/qa-tests/{ios,android}/`.
