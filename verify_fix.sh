#!/bin/bash

echo "=== SKILL COLLISION FIX VERIFICATION ==="
echo ""

echo "1. Checking crypto import..."
grep -c "import { createHash } from \"crypto\"" node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js && echo "✓ Crypto import found" || echo "✗ Crypto import NOT found"

echo ""
echo "2. Checking skillContentMap declaration..."
grep -c "const skillContentMap = new Map()" node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js && echo "✓ Content map found" || echo "✗ Content map NOT found"

echo ""
echo "3. Checking getFileHash function..."
grep -c "function getFileHash(filePath)" node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js && echo "✓ Hash function found" || echo "✗ Hash function NOT found"

echo ""
echo "4. Checking identical content skip logic..."
grep -c "newFileHash === existingFileHash" node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js && echo "✓ Skip logic found" || echo "✗ Skip logic NOT found"

echo ""
echo "5. Running test: identical files should not warn..."
node test-skill-collisions.js 2>&1 | grep -q "SUCCESS: No collision warnings!" && echo "✓ Test 1 PASSED" || echo "✗ Test 1 FAILED"

echo ""
echo "6. Running test: different content should warn..."
node test-collision-detection.js 2>&1 | grep -q "SUCCESS: Collision detection works" && echo "✓ Test 2 PASSED" || echo "✗ Test 2 FAILED"

echo ""
echo "7. Verifying documentation files..."
[ -f SKILL_COLLISION_FIX.md ] && echo "✓ SKILL_COLLISION_FIX.md exists" || echo "✗ SKILL_COLLISION_FIX.md missing"
[ -f IMPLEMENTATION_SUMMARY.md ] && echo "✓ IMPLEMENTATION_SUMMARY.md exists" || echo "✗ IMPLEMENTATION_SUMMARY.md missing"
[ -f CHANGES.md ] && echo "✓ CHANGES.md exists" || echo "✗ CHANGES.md missing"
[ -f test-skill-collisions.js ] && echo "✓ test-skill-collisions.js exists" || echo "✗ test-skill-collisions.js missing"
[ -f test-collision-detection.js ] && echo "✓ test-collision-detection.js exists" || echo "✗ test-collision-detection.js missing"

echo ""
echo "=== ALL CHECKS COMPLETE ==="
