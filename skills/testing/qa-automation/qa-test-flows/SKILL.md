---
name: qa-test-flows
description: >
  Automated UI test flow framework using CDP + agent-device for native apps and
  agent-browser for web apps. Zero-framework approach — bash scripts orchestrate
  simulators with no Detox, Maestro, or Appium dependencies. Provides test lifecycle,
  screenshot capture, assertion helpers, and JSON report generation.
  Invoke when user says "run tests", "test the app", "smoke test", "regression test",
  "verify flows", "run e2e tests", or any task requiring automated UI testing.
allowed-tools: Bash(agent-device:*) Bash(agent-browser:*) Bash(xcrun:*) Bash(adb:*) Bash(open:*) Bash(find:*) Bash(npx:*) Bash(node:*) Read
---

# qa-test-flows

Automated UI test flow framework using a **dual-driver architecture**: **CDP** for navigation/state control and **agent-device** for screenshots/visual assertions in native apps, plus **agent-browser** for web app testing. This is a zero-framework approach — bash scripts orchestrate the entire test lifecycle with no Detox, Maestro, or Appium dependencies.

## Key Innovation: CDP + agent-device + agent-browser

Native mobile apps with complex gesture handlers (full-screen video players, swipe-based feeds) often make coordinate-based tapping unreliable. We solve this by connecting directly to the React Native Hermes runtime via Metro's CDP WebSocket, giving us:

- **Direct navigation control** via `navigationRef.current.navigate()` — no touch coordinates needed
- **Runtime state inspection** — check current route, user state, storage
- **Module access** via Metro's `__r()` require — load any app module at runtime
- **Screenshots & visual verification** via agent-device (best-in-class for simulators)
- **Web app testing** via agent-browser when the same app has a web version

## When to Use

- Smoke testing before submission or release builds
- Regression testing after navigation or feature changes
- Flow verification (auth, navigation, data entry, checkout)
- Platform parity checks (iOS vs Android)
- Pre-PR validation of multi-screen flows
- State persistence verification

## Test Architecture

### Dual Driver System

| Driver | Purpose | Use For |
|--------|---------|---------|
| **CDP (WebSocket)** | Navigation, state queries, JS execution | React Native apps (Hermes runtime) |
| **agent-device** | Screenshots, coordinate taps, swipes, accessibility | Native app simulators/emulators |
| **agent-browser** | Full browser automation, DOM interaction | Web apps, PWAs, browser testing |

### Test Flow Format

All test flows follow a consistent bash template:

```bash
#!/bin/bash
source "$(dirname "$0")/../../lib/test-helpers.sh"
source "$(dirname "$0")/../../lib/cdp-helpers.sh"

TEST_NAME="my-flow"
setup_test "$TEST_NAME"

# Step 1: Navigate
step "Navigate to target screen"
cdp_navigate "TargetScreen"
sleep 2
take_screenshot "01-target-screen"
assert_screenshot "01-target-screen"

# Step 2: Interact
step "Perform action"
tap 200 400
sleep 1
take_screenshot "02-after-action"

# Step 3: Verify
step "Verify result"
route=$(cdp_get_route)
log_info "Route: $route"

teardown_test
```

## Running Tests

### Single Test
```bash
bash skills/testing/qa-automation/qa-test-flows/flows/smoke/example-smoke.sh
```

### All Tests
```bash
bash skills/testing/qa-automation/qa-test-flows/run-all.sh
```

### With Logging
```bash
bash skills/testing/qa-automation/qa-test-flows/flows/smoke/example-smoke.sh 2>&1 | tee /tmp/smoke.log
```

## Writing New Tests

### 1. Copy the template
```bash
cp skills/testing/qa-automation/qa-test-flows/templates/new-flow.sh.template \
   skills/testing/qa-automation/qa-test-flows/flows/my-suite/my-test.sh
chmod +x skills/testing/qa-automation/qa-test-flows/flows/my-suite/my-test.sh
```

### 2. Edit the template
Replace `CUSTOMIZE` markers with your app-specific details.

### 3. Find coordinates
```bash
agent-device screenshot /tmp/debug.png
open /tmp/debug.png  # Measure tap targets
```

### 4. Run and verify
```bash
bash skills/testing/qa-automation/qa-test-flows/flows/my-suite/my-test.sh
ls /tmp/qa-tests/screenshots/my-test/
```

## Helper Libraries

### test-helpers.sh

| Function | Purpose |
|----------|---------|
| `setup_test "name"` | Initialize test, create directories |
| `teardown_test` | Report results, cleanup |
| `step "description"` | Log a numbered test step |
| `log_pass/fail/info/warn` | Status logging |
| `take_screenshot "name"` | Capture screenshot |
| `tap x y` | Tap at coordinates |
| `swipe x1 y1 x2 y2` | Swipe gesture |
| `scroll_dir direction` | Scroll up/down/left/right |
| `assert_app_foreground` | Verify app is running |
| `assert_screenshot "name"` | Verify screenshot exists |
| `assert_text_visible "text"` | Check accessibility tree |
| `launch_app` | Launch/relaunch the app |
| `close_app` | Terminate the app |

### cdp-helpers.sh

| Function | Purpose |
|----------|---------|
| `cdp_eval "expression"` | Execute JS in Hermes |
| `cdp_eval_safe "expression"` | Eval with ErrorUtils suppression |
| `cdp_navigate "Screen"` | Navigate to screen |
| `cdp_navigate_tab "TabScreen"` | Navigate to tab |
| `cdp_get_route` | Get current route name |
| `cdp_get_state` | Get full nav state |
| `cdp_go_back` | Go back |
| `nav_explore/search/home/profile` | Quick tab navigation |

## File Structure

```
qa-test-flows/
├── SKILL.md                          # This file
├── lib/
│   ├── test-helpers.sh               # Core test framework
│   └── cdp-helpers.sh                # CDP interaction helpers
├── flows/
│   └── smoke/
│       └── example-smoke.sh          # Example smoke test
├── templates/
│   └── new-flow.sh.template          # Template for new tests
└── run-all.sh                        # Master test runner
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| agent-device click hangs | Commands run in background with timeout — if still hanging, increase `DEVICE_CMD_TIMEOUT` |
| Dev console overlay covers screen | Call `dismiss_error_overlay` from scroll-helpers, or use CDP to suppress LogBox |
| Accessibility tree is sparse | React Native trees are thinner than web — prefer coordinates + screenshots |
| CDP timeout | Check dev server is running: `curl $DEV_SERVER_HEALTH` |
| Module ID changed after code update | Delete cache: `rm $NAV_MODULE_CACHE` — setup guard will re-scan |
