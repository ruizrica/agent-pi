# QA Device Coordinate Map — Template

## How to Use This File

This is a **template** for documenting your app's tap targets. Fill in the coordinates for your specific app by:

1. Take a screenshot: `agent-device screenshot /tmp/debug.png`
2. Open it in an image viewer
3. Measure the tap target position in **pixels**
4. Divide by the device scale factor to get **logical points**
5. Record the coordinates below

## Device Dimensions

### iPhone 16 Pro (default)
- Logical resolution: **402 × 874** points
- Pixel resolution: 1206 × 2622 (3x scale)
- Safe area top: ~59 points (Dynamic Island + status bar)
- Safe area bottom: ~34 points (home indicator)

### iPhone 15 / 16
- Logical resolution: **393 × 852** points
- Pixel resolution: 1179 × 2556 (3x scale)

### Pixel 8 / 9
- Logical resolution: **411 × 915** points
- Pixel resolution: 1080 × 2400 (2.625x scale)

### iPad Pro 11"
- Logical resolution: **834 × 1194** points

## Bottom Tab Bar

Most apps have a bottom tab bar. Measure the Y position and X position of each tab.

| Tab | Name | x | y | Notes |
|-----|------|---|---|-------|
| 1 | *(your tab)* | `___` | `___` | |
| 2 | *(your tab)* | `___` | `___` | |
| 3 | *(your tab)* | `___` | `___` | |
| 4 | *(your tab)* | `___` | `___` | |
| 5 | *(your tab)* | `___` | `___` | |

**Tip:** Tab bar Y is usually around 850-860 on iPhone Pro models.

## Common UI Elements

| Element | x | y | Notes |
|---------|---|---|-------|
| Back button (top-left) | `___` | `___` | Usually ~30, 60 |
| Settings/Menu (top-right) | `___` | `___` | Usually ~380, 60 |
| Screen center | `___` | `___` | ~200, 437 on iPhone Pro |

## Screen-Specific Elements

### Screen: *(your screen name)*

| Element | x | y | Notes |
|---------|---|---|-------|
| *(element)* | `___` | `___` | |
| *(element)* | `___` | `___` | |

### Screen: *(another screen)*

| Element | x | y | Notes |
|---------|---|---|-------|
| *(element)* | `___` | `___` | |

## Tips for Finding Coordinates

### Method 1: Screenshot + Image Viewer
```bash
agent-device screenshot /tmp/debug.png
open /tmp/debug.png  # Opens in Preview on macOS
```
Use Preview's inspector to read pixel coordinates, then divide by scale factor.

### Method 2: Accessibility Snapshot
```bash
agent-device snapshot -i
```
Elements with tap targets show bounding boxes. Use the center of the box.

### Method 3: agent-device highlight
```bash
agent-device snapshot -i       # Get refs like @e1, @e2
agent-device highlight @e1     # Highlights the element on screen
```

### Method 4: Trial and Error
```bash
agent-device click 200 400     # Try a tap
agent-device screenshot /tmp/after-tap.png  # Check result
```

## Using Coordinates in Tests

Set coordinate overrides in `qa.config.sh` or `qa.config.local.sh`:

```bash
# Tab bar
export TAB_BAR_Y=855
export TAB_1_X=60
export TAB_2_X=170
export TAB_3_X=290
export TAB_4_X=400
export TAB_5_X=520

# Custom elements
export BACK_BUTTON_X=30
export BACK_BUTTON_Y=60
```

Then use them in test scripts:

```bash
source qa.config.sh
tap $TAB_1_X $TAB_BAR_Y    # Tap first tab
tap $BACK_BUTTON_X $BACK_BUTTON_Y  # Tap back
```
