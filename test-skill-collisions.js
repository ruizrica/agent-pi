#!/usr/bin/env node

/**
 * Test script to verify that identical skill files don't produce collision warnings
 */

import { loadSkills } from './node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js';
import { resolve } from 'path';

const cwd = process.cwd();

console.log('Testing skill collision detection...\n');

// Test 1: Load from agent-pi default locations
console.log('=== TEST 1: Default loading (project-first) ===');
const result1 = loadSkills({
  cwd,
  agentDir: resolve(cwd, '.pi'),
  skillPaths: [],
  includeDefaults: true,
});

console.log(`Total skills loaded: ${result1.skills.length}`);
console.log(`Total diagnostics: ${result1.diagnostics.length}`);

// Filter for collision diagnostics
const collisions1 = result1.diagnostics.filter(d => d.type === 'collision');

if (collisions1.length > 0) {
  console.log('COLLISIONS FOUND:');
  collisions1.forEach(d => {
    console.log(`  - ${d.collision?.name}: ${d.collision?.winnerPath} vs ${d.collision?.loserPath}`);
  });
} else {
  console.log('SUCCESS: No collision warnings!');
}

// Test 2: Explicitly load both skill paths
console.log('\n=== TEST 2: Explicit paths (project + home) ===');
const result2 = loadSkills({
  cwd,
  agentDir: resolve(cwd, '.pi'),
  skillPaths: [
    resolve(cwd, 'skills'),
    resolve(cwd, 'extensions/private/skills'),
  ],
  includeDefaults: false,
});

console.log(`Total skills loaded: ${result2.skills.length}`);
console.log(`Total diagnostics: ${result2.diagnostics.length}`);

const collisions2 = result2.diagnostics.filter(d => d.type === 'collision');
if (collisions2.length > 0) {
  console.log('COLLISIONS FOUND:');
  collisions2.forEach(d => {
    console.log(`  - ${d.collision?.name}`);
  });
} else {
  console.log('SUCCESS: No collision warnings!');
}

// Check that we have expected skills from both locations
const skillNames = result2.skills.map(s => s.name).sort();
console.log(`\nLoaded ${skillNames.length} unique skills`);

// Check for private skills
const privateSkillNames = skillNames.filter(name => 
  ['way-ios', 'way-simulators', 'swagbucks', 'reco-simulators'].includes(name)
);

console.log(`Private skills loaded: ${privateSkillNames.join(', ') || 'none'}`);

// Show all skills for verification
console.log('\nAll loaded skills:');
skillNames.forEach(name => {
  const skill = result2.skills.find(s => s.name === name);
  console.log(`  - ${name} (${skill?.filePath.replace(cwd, '.')})`);
});

process.exit(collisions2.length > 0 ? 1 : 0);
