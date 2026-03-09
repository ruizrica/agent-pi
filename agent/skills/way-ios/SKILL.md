---
name: way-ios
description: Project-specific iOS workflow for the Way app. Use when working in /Users/ricardo/Workshop/GitHub/way-ios-prd, especially to build, install, launch, inspect, or visually reference the iOS app for product work and Android porting. Prefer device-agent interaction with the iOS simulator when you need to inspect actual screens or flows.
allowed-tools: Bash
---

# way-ios

Use this skill whenever you are working on the Way iOS project:

- Project path: `/Users/ricardo/Workshop/GitHub/way-ios-prd`
- Workspace: `Way.xcworkspace`
- Main scheme: `Way`
- Bundle ID: `com.eatmyway.wayapp`

## Remembered simulator state

As of the last verified run:

- Preferred simulator device name: `iPhone 17 Pro`
- Preferred simulator UDID: `EA2BF44C-98A8-48D0-A7CA-9E7C5BB5F06C`
- App is installed on the booted simulator with bundle id `com.eatmyway.wayapp`
- Verified launch PID from last successful run: `59797`

Always prefer this simulator first unless the user asks for another device.

## Primary use cases

Use this skill when you need to:

- build the Way iOS app
- install or launch the app in the iOS simulator
- inspect specific screens for Android port reference
- compare iOS UI/flows against Android implementation work
- capture the current state of the app with a device agent or simulator tooling

## Core workflow

### 1. Work from the project root

```bash
cd /Users/ricardo/Workshop/GitHub/way-ios-prd
```

### 2. Build for the preferred simulator

```bash
xcodebuild -workspace Way.xcworkspace \
  -scheme Way \
  -destination 'platform=iOS Simulator,id=EA2BF44C-98A8-48D0-A7CA-9E7C5BB5F06C' \
  build
```

### 3. Find the built app

Typical successful output path:

```bash
find ~/Library/Developer/Xcode/DerivedData -path '*Build/Products/*-iphonesimulator/Way.app'
```

Most recently verified app path:

```bash
/Users/ricardo/Library/Developer/Xcode/DerivedData/Way-cpdcsetlfprfwbacbxkchwdrufow/Build/Products/Release-iphonesimulator/Way.app
```

### 4. Install on the booted simulator

```bash
xcrun simctl install booted '/Users/ricardo/Library/Developer/Xcode/DerivedData/Way-cpdcsetlfprfwbacbxkchwdrufow/Build/Products/Release-iphonesimulator/Way.app'
```

### 5. Launch the app

```bash
xcrun simctl launch booted com.eatmyway.wayapp
```

## Simulator utilities

### List available simulators

```bash
xcrun simctl list devices available
```

### Boot the preferred simulator if needed

```bash
xcrun simctl boot EA2BF44C-98A8-48D0-A7CA-9E7C5BB5F06C
open -a Simulator
```

### Open the app by bundle id

```bash
xcrun simctl launch booted com.eatmyway.wayapp
```

## Device-agent guidance

When the task requires understanding how a screen looks or behaves, prefer a device agent or simulator interaction over code reading alone.

Recommended approach:

1. Build and launch the app using the commands above.
2. Use the device agent against the preferred simulator to:
   - navigate flows
   - inspect specific screens
   - verify labels, spacing, tab order, and interaction patterns
   - capture screenshots for Android port reference
3. Record the exact screen or flow name being inspected so Android-port agents can map it back to the source implementation.

If a device-agent tool is available, always prefer:

- the remembered `iPhone 17 Pro` simulator first
- the installed app `com.eatmyway.wayapp`

## What Android port agents should extract

When referencing the iOS app for Android implementation, capture:

- screen name and navigation path
- visible text content
- layout structure and hierarchy
- component states and transitions
- button labels and ordering
- spacing, grouping, and empty/loading/error states
- modal, sheet, and full-screen presentation behavior

## Important project notes

- Use `Way.xcworkspace`, not only the Xcode project, for normal app builds.
- Main scheme is `Way`.
- The project recently needed a local dependency shim fix for `DependenciesAdditionsShim`; if build issues reappear around dependency wiring, inspect `Package.swift` and `Sources/DependenciesAdditionsShim/DependenciesAdditionsShim.swift` first.

## Quick command summary

```bash
cd /Users/ricardo/Workshop/GitHub/way-ios-prd
xcodebuild -workspace Way.xcworkspace -scheme Way -destination 'platform=iOS Simulator,id=EA2BF44C-98A8-48D0-A7CA-9E7C5BB5F06C' build
xcrun simctl install booted '/Users/ricardo/Library/Developer/Xcode/DerivedData/Way-cpdcsetlfprfwbacbxkchwdrufow/Build/Products/Release-iphonesimulator/Way.app'
xcrun simctl launch booted com.eatmyway.wayapp
```
