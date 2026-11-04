---
name: qa-state-persistence
description: >
  QA test skill for verifying UI state persistence across navigation. Tests that
  state changes (likes, bookmarks, cart items, form inputs) survive scrolling away
  and returning. Uses CDP + agent-device dual-driver architecture. Works with any
  React Native app that uses list-based feeds or scrollable content.
  Invoke when user says "test state persistence", "test like state", "verify bookmark persists",
  "QA the state", "test data survives scroll", "verify UI state", or any task requiring
  state persistence verification across navigation.
allowed-tools: Bash(agent-device:*) Bash(agent-browser:*) Bash(xcrun:*) Bash(node:*) Bash(curl:*) Bash(npx:*) Read
---

# qa-state-persistence

QA test skill for verifying **UI state persistence** across navigation. Tests that state changes (likes, bookmarks, cart additions, form inputs) survive scrolling away and returning. Uses the dual-driver architecture (CDP + agent-device).

## What It Tests

| Test | Method | Assertion |
|------|--------|-----------|
| Navigate to feed | CDP navigation | Route is on feed screen |
| Record item identity | CDP feed data query | Item ID and initial state captured |
| Verify initial state | CDP property query | State property is in expected initial value |
| Mutate state | CDP data mutation | Property flips (e.g., `isLiked: false → true`) |
| Scroll away (N items) | CDP scroll or agent-device swipe | Feed index advances |
| Scroll back | CDP `scrollToIndex(0)` | Feed index returns to 0 |
| **State persisted** | CDP property query | **KEY ASSERTION: property still has mutated value** |
| Cleanup | CDP data mutation | Restore original state |
| Final route check | CDP `cdp_get_route` | Still on feed screen |

## Configuration

Set your app-specific values in `qa.config.sh`:

```bash
# What property to test
export STATE_PROPERTY="isLiked"              # Property name to toggle
export STATE_COUNTER_PROPERTY="likesCount"   # Associated counter (optional)
export STATE_SCROLL_COUNT=5                   # How many items to scroll past

# Feed screen
export SCREEN_EXPLORE="ExploreScreen"        # Your feed screen name

# Feed debug hook (set up in your app's dev build)
export GLOBAL_FEED_VAR="__qaFeedState"       # Global variable name
```

### Setting Up the Feed Debug Hook

In your app's feed component (dev builds only), expose:

```javascript
// In your feed component (e.g., ExploreFeed.tsx):
if (__DEV__) {
  globalThis.__qaFeedState = {
    currentIndex: currentIndex,
    scrollToNext: () => flatListRef.current?.scrollToIndex({ index: currentIndex + 1 }),
    scrollToIndex: (i) => flatListRef.current?.scrollToIndex({ index: i }),
    getData: () => feedData,        // Return the full data array
    getItem: (i) => feedData[i],    // Return item at index
    dataLength: feedData.length,
  };
}
```

## Architecture

```
CDP (Hermes Runtime)              agent-device (Simulator)
┌──────────────────────┐          ┌──────────────────────┐
│ navigate to tab      │          │ screenshot capture    │
│ install state hook   │          │ tap fallback (if CDP  │
│ query item property  │          │   mutation fails)     │
│ mutate item property │          │ swipe fallback (if    │
│ scrollToNext()       │          │   scroll hook absent) │
│ scrollToIndex(0)     │          │                       │
│ read feed data       │          │                       │
└──────────────────────┘          └──────────────────────┘
```

## Usage

### Run the example test
```bash
bash skills/testing/qa-automation/qa-state-persistence/run.sh
```

### View results
- Screenshots: `/tmp/qa-tests/screenshots/<test-name>/`
- Report JSON: `/tmp/qa-tests/<test-name>-report.json`

## Test Flow Diagram

```
┌─────────────────┐
│ Navigate to      │
│ Feed Screen      │
└────────┬────────┘
         │
┌────────▼────────┐
│ Record item #0   │
│ (state=initial)  │
└────────┬────────┘
         │
┌────────▼────────┐
│ Mutate state     │
│ (state=changed)  │
└────────┬────────┘
         │
┌────────▼────────┐
│ Scroll away Nx   │
│ (index → N)      │
└────────┬────────┘
         │
┌────────▼────────┐
│ Scroll back to 0 │
│ (index → 0)      │
└────────┬────────┘
         │
┌────────▼────────┐
│ ★ VERIFY: state  │
│   persisted!      │
└────────┬────────┘
         │
┌────────▼────────┐
│ Cleanup (restore │
│ original state)   │
└─────────────────┘
```

## File Structure

```
qa-state-persistence/
├── SKILL.md                          # This file
├── lib/
│   └── state-helpers.sh              # State query, mutation, scroll-to-index
├── flows/
│   └── example-state-test.sh         # Example test (customize for your app)
└── run.sh                            # Runner with JSON report output
```

## Troubleshooting

### "Feed hook not available"
The `__qaFeedState` global isn't set. Ensure:
- Your feed component sets it up in `__DEV__` mode
- The feed screen is mounted (navigate to it first)
- The hook name matches `GLOBAL_FEED_VAR` in config

### "Could not read feed data"
`getData()` or `getItem()` failed. Possible causes:
- Component hasn't fully mounted yet (increase settle time)
- Feed data structure changed
- Hook was set up before data loaded

### "scrollToIndex not available"
The hook doesn't expose `scrollToIndex`. The test falls back to repeated swipe-down gestures.

### "State lost after scroll"
**This is the real failure the test catches.** If state doesn't persist, investigate:
- List item recycling (FlatList/FlashList virtualization)
- State management (local vs global state)
- Cache invalidation during scroll
- Component unmount/remount cycles
