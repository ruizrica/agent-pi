# Mode Bar & Text Input Fixes

## Problem
1. Each mode (PLAN, SPEC, PIPELINE, TEAM, CHAIN) uses a different background color in the mode bar
2. The task list (rendered inside agent-team widget) can appear between the mode bar and the text input

## Plan

### Step 1: Unify mode bar colors to blue
**File: `agent/extensions/lib/mode-cycler-logic.ts`**
- Change all `MODE_COLORS` to `"accent"` (except NORMAL stays empty)
- Change all `MODE_TEXT_ANSI` to `BOLD_WHITE` (except NORMAL stays empty)

**File: `agent/extensions/mode-cycler.ts`**
- Change all `ANSI_BG` values to `"\x1b[44m"` (blue) for all non-NORMAL modes

### Step 2: Pin mode bar directly above text input
**File: `agent/extensions/mode-cycler.ts`**
- Export `refreshModeBlock` via `globalThis.__piRefreshModeBlock`
- This function re-sets the mode-block widget to ensure it's the last `aboveEditor` widget (renders closest to editor)

**File: `agent/extensions/agent-team.ts`**
- At the end of `updateWidget()`, after `setWidget("agent-team", ...)`, call `globalThis.__piRefreshModeBlock?.()`
- This ensures the mode bar always renders below the tasks (closer to editor)

### Step 3: Update tests
**File: `agent/extensions/__tests__/mode-cycler-logic.test.ts`**
- Update `modeColor` tests: all modes return `"accent"` (except NORMAL)
- Update `modeTextAnsi` tests: all modes return `"\x1b[1;97m"` bold white (except NORMAL)

### Step 4: Verify
- [ ] Run mode-cycler-logic tests
- [ ] Run all extension tests
- [ ] Confirm no type errors
