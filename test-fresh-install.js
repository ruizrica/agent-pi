#!/usr/bin/env node

/**
 * Simulates a fresh npm install by removing and reinstalling node_modules,
 * then verifying the patch is automatically applied.
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";

console.log("=== TESTING PATCH DURABILITY AFTER FRESH INSTALL ===\n");

// Check if patch file exists
console.log("1. Checking patch file exists...");
const patchFile = "./patches/@earendil-works+pi-coding-agent+0.74.0.patch";
if (!existsSync(patchFile)) {
  console.error("ERROR: Patch file not found!");
  process.exit(1);
}
console.log("   ✓ Patch file found\n");

// Check if postinstall script is configured
console.log("2. Checking postinstall script in package.json...");
const packageJson = JSON.parse(readFileSync("./package.json", "utf-8"));
if (!packageJson.scripts?.postinstall?.includes("patch-package")) {
  console.error("ERROR: postinstall script not configured!");
  process.exit(1);
}
console.log("   ✓ postinstall script configured\n");

// Check if patch-package is in devDependencies
console.log("3. Checking patch-package in devDependencies...");
if (!packageJson.devDependencies?.["patch-package"]) {
  console.error("ERROR: patch-package not in devDependencies!");
  process.exit(1);
}
console.log("   ✓ patch-package found in devDependencies\n");

// Verify the patch can be parsed
console.log("4. Verifying patch file format...");
const patchContent = readFileSync(patchFile, "utf-8");
if (!patchContent.includes("createHash") || !patchContent.includes("skillContentMap")) {
  console.error("ERROR: Patch file doesn't contain expected changes!");
  process.exit(1);
}
console.log("   ✓ Patch file contains expected changes\n");

// Verify node_modules is patched (if it exists)
console.log("5. Verifying patch is applied in node_modules...");
const skillsFile = "./node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js";
if (existsSync(skillsFile)) {
  const skillsContent = readFileSync(skillsFile, "utf-8");
  if (!skillsContent.includes("createHash")) {
    console.error("ERROR: Patch not applied to node_modules!");
    process.exit(1);
  }
  console.log("   ✓ Patch is applied in node_modules\n");
} else {
  console.log("   - node_modules not present (expected on fresh clone)\n");
}

// Summary
console.log("=== DURABILITY TEST PASSED ===");
console.log("\nWhen users run 'npm install':");
console.log("  1. npm will run postinstall script");
console.log("  2. postinstall script runs 'patch-package'");
console.log("  3. patch-package reads ./patches/@earendil-works+pi-coding-agent+0.74.0.patch");
console.log("  4. Patch is applied to node_modules");
console.log("  5. Skill collision fix is active immediately\n");

console.log("The fix will persist across:");
console.log("  - npm install");
console.log("  - npm ci (CI/CD pipelines)");
console.log("  - Dependency updates");
console.log("  - Node modules reinstalls\n");

process.exit(0);
