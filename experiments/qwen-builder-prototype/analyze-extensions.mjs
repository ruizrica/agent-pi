#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const REPORT_HINTS = [
  "viewer",
  "report",
  "plan",
  "cleanup",
  "file-viewer",
  "security-report",
  "reports",
  "research-viewer",
  "spec-viewer",
  "test-viewer",
  "board-viewer",
  "completion",
];

async function main() {
  const repoRoot = process.cwd();
  const extensionsDir = path.join(repoRoot, "extensions");
  const testsDir = path.join(extensionsDir, "__tests__");
  const outputPathArg = process.argv[2];

  await assertDirectoryExists(extensionsDir, "extensions directory not found");

  const allExtensionFiles = await walkFiles(extensionsDir);
  const testFiles = allExtensionFiles
    .filter((file) => file.startsWith(testsDir))
    .filter((file) => file.endsWith(".test.ts") || file.endsWith(".test.js") || file.endsWith("integration-test.ts"))
    .sort();

  const entryFiles = allExtensionFiles
    .filter((file) => path.dirname(file) === extensionsDir)
    .filter((file) => file.endsWith(".ts"))
    .sort();

  const viewerFiles = allExtensionFiles
    .filter((file) => {
      const relative = toRelative(repoRoot, file).toLowerCase();
      return REPORT_HINTS.some((hint) => relative.includes(hint));
    })
    .sort();

  const entries = entryFiles.map((file) => {
    const relative = toRelative(repoRoot, file);
    const baseName = path.basename(file, path.extname(file));
    const matchingTests = testFiles.filter((testFile) => path.basename(testFile).includes(baseName));
    const category = categorizeEntry(baseName);

    return {
      relative,
      baseName,
      category,
      matchingTests: matchingTests.map((testFile) => toRelative(repoRoot, testFile)),
    };
  });

  const report = renderMarkdown({
    generatedAt: new Date().toISOString(),
    entryCount: entryFiles.length,
    viewerCount: viewerFiles.length,
    testCount: testFiles.length,
    entries,
    viewerFiles: viewerFiles.map((file) => toRelative(repoRoot, file)),
    testFiles: testFiles.map((file) => toRelative(repoRoot, file)),
  });

  if (outputPathArg) {
    const outputPath = path.resolve(repoRoot, outputPathArg);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, report, "utf8");
  }

  process.stdout.write(report);
}

async function assertDirectoryExists(directoryPath, message) {
  const stats = await fs.stat(directoryPath).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(message);
  }
}

async function walkFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function categorizeEntry(baseName) {
  if (baseName.includes("viewer") || baseName.includes("report")) {
    return "viewer/report";
  }
  if (baseName.includes("agent") || baseName.includes("team")) {
    return "agent/orchestration";
  }
  if (baseName.includes("security") || baseName.includes("safe")) {
    return "security";
  }
  if (baseName.includes("plan") || baseName.includes("spec") || baseName.includes("research")) {
    return "planning/research";
  }
  return "general";
}

function renderMarkdown(data) {
  const lines = [];

  lines.push("# Extensions Analysis Report");
  lines.push("");
  lines.push(`Generated: ${data.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Entry files: ${data.entryCount}`);
  lines.push(`- Viewer/report-related files: ${data.viewerCount}`);
  lines.push(`- Test files under extensions/__tests__: ${data.testCount}`);
  lines.push("");

  lines.push("## Entry Files");
  lines.push("");
  lines.push("| File | Category | Matching tests |");
  lines.push("| --- | --- | --- |");
  for (const entry of data.entries) {
    const matchingTests = entry.matchingTests.length > 0 ? entry.matchingTests.join("<br>") : "—";
    lines.push(`| \`${entry.relative}\` | ${entry.category} | ${matchingTests} |`);
  }
  lines.push("");

  lines.push("## Viewer and Report Surface");
  lines.push("");
  for (const file of data.viewerFiles) {
    lines.push(`- \`${file}\``);
  }
  lines.push("");

  lines.push("## Test Files");
  lines.push("");
  for (const file of data.testFiles) {
    lines.push(`- \`${file}\``);
  }
  lines.push("");

  lines.push("## Notes");
  lines.push("");
  lines.push("- Entry files are identified as top-level TypeScript files directly under `extensions/`.");
  lines.push("- Viewer/report files are identified using filename heuristics and may include helper HTML/render modules.");
  lines.push("- Matching tests are inferred by basename similarity and may miss tests with broader or indirect naming.");
  lines.push("");

  return lines.join("\n");
}

function toRelative(repoRoot, absolutePath) {
  return path.relative(repoRoot, absolutePath) || ".";
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
