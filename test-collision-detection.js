#!/usr/bin/env node

/**
 * Test script to verify that collision detection still works for different content
 */

import { loadSkills } from './node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

console.log('Testing collision detection for different content...\n');

// Create two temporary directories with identical names but different content
const tempDir1 = mkdtempSync(join(tmpdir(), 'skill-test-'));
const tempDir2 = mkdtempSync(join(tmpdir(), 'skill-test-'));

// Create skill directories with same name but different content
const skillDir1 = join(tempDir1, 'test-skill');
const skillDir2 = join(tempDir2, 'test-skill');

import('fs').then(fs => {
  fs.mkdirSync(skillDir1, { recursive: true });
  fs.mkdirSync(skillDir2, { recursive: true });

  // Write skill files with same name but different content
  writeFileSync(join(skillDir1, 'SKILL.md'), `---
name: test-skill
description: First version
---

# Test Skill Version 1

This is the first version.
`);

  writeFileSync(join(skillDir2, 'SKILL.md'), `---
name: test-skill
description: Second version (different)
---

# Test Skill Version 2

This is a different version.
`);

  // Load both
  const result = loadSkills({
    cwd: tempDir1,
    agentDir: tempDir1,
    skillPaths: [skillDir1, skillDir2],
    includeDefaults: false,
  });

  const collisions = result.diagnostics.filter(d => d.type === 'collision');
  
  console.log(`Total skills loaded: ${result.skills.length}`);
  console.log(`Total diagnostics: ${result.diagnostics.length}`);
  console.log(`Collision warnings: ${collisions.length}`);

  if (collisions.length > 0) {
    console.log('\nCOLLISION DETECTED (Expected behavior):');
    collisions.forEach(d => {
      console.log(`  - ${d.collision?.name}`);
      console.log(`    Winner: ${d.collision?.winnerPath}`);
      console.log(`    Loser:  ${d.collision?.loserPath}`);
    });
    console.log('\nSUCCESS: Collision detection works for different content!');
    process.exit(0);
  } else {
    console.log('\nERROR: Expected collision warning but got none!');
    process.exit(1);
  }
});
