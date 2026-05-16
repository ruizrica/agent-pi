# Skill Collision Fix: Identical Files No Longer Warn

## Problem

When pi-coding-agent loads skills from multiple locations, it would report collision warnings for skill files with the same name, even if they had identical content. This was particularly noisy for duplicated skill files that existed in both:
- `extensions/private/skills/` (local project)
- `~/.pi/packages/private/skills/` (global installation)

Example duplicate skills with identical content:
- `way-ios`
- `way-simulators`
- `swagbucks`
- `reco-simulators`

These would each generate a "name collision" warning even though they were byte-for-byte identical.

## Solution

Modified `/node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js` to detect and silently skip duplicate skill files with identical content while still reporting real collisions (files with the same name but different content).

### Changes Made

1. **Added crypto import** for SHA-256 hashing of file content
2. **Added `getFileHash()` function** to compute a hash of each skill file's content
3. **Added `skillContentMap`** to track hashes of loaded skills by name
4. **Modified collision detection logic** to:
   - Skip silently if two skills with the same name have identical content (same hash)
   - Still warn if they have different content (different hashes)
   - Preserve existing symlink deduplication behavior

### Code Changes

In `loadSkills()` function, the `addSkills()` nested function now includes:

```javascript
const existing = skillMap.get(skill.name);
if (existing) {
  // Check if files have identical content
  const newFileHash = getFileHash(skill.filePath);
  const existingFileHash = skillContentMap.get(skill.name);
  if (newFileHash && existingFileHash && newFileHash === existingFileHash) {
    // Files are identical, skip silently (don't add to collision diagnostics)
    continue;
  }
  // Files differ, report collision
  collisionDiagnostics.push({ ... });
}
```

## Verification

Run the verification scripts to confirm the fix:

```bash
# Test 1: Verify identical files don't produce warnings
node test-skill-collisions.js

# Test 2: Verify collision detection still works for different content
node test-collision-detection.js
```

Expected results:
- Test 1: All 44 skills load with 0 collision warnings
- Test 2: Different content correctly triggers collision warning

## Impact

- **Positive**: Eliminates noisy false-positive collision warnings for identical duplicate files
- **Safe**: Real collisions (different content) are still detected and warned
- **Backward Compatible**: No API changes, existing behavior preserved for non-identical files

## Files Modified

- `/node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js` - Core fix
- Added: `test-skill-collisions.js` - Verification script for identical files
- Added: `test-collision-detection.js` - Verification script for different content

## Future Improvements

This fix is applied to the installed npm package. A more permanent solution would be to:
1. Submit a PR to pi-coding-agent upstream
2. Update to use a pinned version that includes this fix
3. Or use npm's patch-package tool to maintain the patch across dependency updates
