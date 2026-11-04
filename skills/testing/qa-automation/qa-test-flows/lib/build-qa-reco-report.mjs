#!/usr/bin/env node
// ABOUTME: Assemble QA Reco pre-release JSONL check output into QAReportData.
// ABOUTME: Groups Basic Feed, Scrolling, Liking, and Commenting checks into release sections.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultManifest = join(__dirname, "..", "reco-prerelease", "manifest.json");

function parseArgs(argv) {
  const args = { input: "/tmp/qa-tests", output: "/tmp/qa-tests/qa-reco-prerelease-report.json", manifest: defaultManifest, title: "QA Reco Pre-release Report" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else if (arg === "--manifest") args.manifest = argv[++i];
    else if (arg === "--title") args.title = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node build-qa-reco-report.mjs --input /tmp/qa-tests --output /tmp/qa-tests/qa-reco-prerelease-report.json");
      process.exit(0);
    }
  }
  return args;
}

function walk(dir, predicate, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function readChecks(inputDir) {
  const files = walk(inputDir, (file) => file.endsWith("checks.jsonl"));
  const checks = [];
  for (const file of files) {
    const platformFromPath = relative(inputDir, file).split(/[\\/]/)[0];
    const lines = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        checks.push({ ...parsed, platform: parsed.platform || platformFromPath, sourceFile: file });
      } catch (error) {
        checks.push({
          platform: platformFromPath,
          sectionId: "unknown",
          sectionName: "Unknown",
          id: "parse-error",
          name: "Parse check result",
          status: "failed",
          message: `Could not parse ${file}: ${error.message}`,
          sourceFile: file,
        });
      }
    }
  }
  return checks;
}

const statusRank = { passed: 0, skipped: 1, partial: 2, blocked: 3, failed: 4 };
function aggregateStatus(results) {
  if (results.length === 0) return "skipped";
  return results.map((r) => r.status || "skipped").sort((a, b) => (statusRank[b] ?? 1) - (statusRank[a] ?? 1))[0];
}

function sectionStatus(checks) {
  if (checks.some((check) => check.status === "failed" || check.status === "blocked")) return "blocked";
  if (checks.some((check) => check.status === "partial" || check.status === "skipped")) return "partial";
  return "passed";
}

function evidenceFromResult(result) {
  const evidence = [];
  if (result.platform) evidence.push({ label: "Platform", value: result.platform });
  if (result.message) evidence.push({ label: "Message", value: result.message });
  if (Array.isArray(result.evidence)) evidence.push(...result.evidence);
  if (result.sourceFile) evidence.push({ label: "Source", value: result.sourceFile });
  return evidence;
}

function buildReport({ manifest, checks, title, inputDir }) {
  const platforms = [...new Set(checks.map((check) => check.platform).filter(Boolean))];
  const screenshots = [];
  const sections = manifest.sections.map((section) => {
    const sectionChecks = section.checks.map((checkDef) => {
      const results = checks.filter((check) => check.sectionId === section.id && check.id === checkDef.id);
      const status = aggregateStatus(results);
      const checkScreens = [...new Set(results.flatMap((result) => Array.isArray(result.screenshots) ? result.screenshots : []).filter(Boolean))];
      for (const filename of checkScreens) {
        screenshots.push({ filename, label: `${section.name}: ${checkDef.name}`, suite: section.name, step: checkDef.id });
      }
      const messages = results.map((result) => result.message).filter(Boolean);
      return {
        id: checkDef.id,
        name: checkDef.name,
        status,
        message: messages.join(" | ") || (results.length === 0 ? "No result was emitted for this check." : undefined),
        requiredEvidence: checkDef.requiredEvidence || [],
        evidence: results.flatMap(evidenceFromResult),
        screenshots: checkScreens,
      };
    });
    return {
      id: section.id,
      name: section.name,
      priority: section.priority,
      risk: section.risk,
      status: sectionStatus(sectionChecks),
      summary: section.description || `${section.name} pre-release checks`,
      platform: platforms.length > 1 ? "both" : platforms[0],
      acceptanceCriteria: section.acceptanceCriteria || [],
      checks: sectionChecks,
    };
  });

  const flatChecks = sections.flatMap((section) => section.checks);
  const totalPassed = flatChecks.filter((check) => check.status === "passed").length;
  const totalFailed = flatChecks.filter((check) => check.status === "failed" || check.status === "blocked").length;
  const totalSkipped = flatChecks.filter((check) => check.status === "skipped" || check.status === "partial").length;
  const gateBlocked = sections.some((section) => section.priority === "P1" && (section.status === "blocked" || section.status === "failed"));
  const gateReview = !gateBlocked && sections.some((section) => section.status === "partial" || section.status === "skipped");
  const releaseGate = gateBlocked
    ? { status: "blocked", label: "RELEASE BLOCKED", reason: "One or more P1 QA Reco sections are failed or blocked.", blockingSections: sections.filter((section) => section.status === "blocked" || section.status === "failed").map((section) => section.name) }
    : gateReview
      ? { status: "review", label: "NEEDS REVIEW", reason: "One or more QA Reco checks are partial or skipped." }
      : { status: "ready", label: "READY FOR RELEASE", reason: "All P1 QA Reco sections passed." };

  const suites = platforms.map((platform) => {
    const platformChecks = checks.filter((check) => check.platform === platform);
    return {
      name: `Reco pre-release (${platform})`,
      type: "e2e",
      platform: platform === "android" ? "android" : "ios",
      passed: platformChecks.filter((check) => check.status === "passed").length,
      failed: platformChecks.filter((check) => check.status === "failed" || check.status === "blocked").length,
      skipped: platformChecks.filter((check) => check.status === "skipped" || check.status === "partial").length,
      duration: 0,
      tests: platformChecks.map((check) => ({
        name: check.name,
        suite: check.sectionName || check.sectionId,
        status: check.status === "blocked" || check.status === "partial" ? "skipped" : check.status,
        error: check.status === "failed" || check.status === "blocked" ? check.message : undefined,
        screenshots: Array.isArray(check.screenshots) ? check.screenshots : [],
      })),
    };
  });

  return {
    title,
    generatedAt: new Date().toISOString(),
    config: {
      runUnit: false,
      runE2E: true,
      e2eSuites: sections.map((section) => section.id),
      platform: platforms.length > 1 ? "both" : platforms[0] === "android" ? "android" : "ios",
      captureScreenshots: screenshots.length > 0,
      generateCoverage: false,
    },
    releaseGate,
    sections,
    suites,
    totalPassed,
    totalFailed,
    totalSkipped,
    totalDuration: 0,
    screenshots,
    metadata: {
      inputDir,
      manifest: manifest.id,
      platforms,
      sourceFiles: [...new Set(checks.map((check) => check.sourceFile).filter(Boolean))],
    },
  };
}

const args = parseArgs(process.argv.slice(2));
const manifest = JSON.parse(readFileSync(args.manifest, "utf8"));
const checks = readChecks(args.input);
const report = buildReport({ manifest, checks, title: args.title, inputDir: args.input });
mkdirSync(dirname(args.output), { recursive: true });
writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote QA Reco report: ${args.output}`);
console.log(`${report.releaseGate.label}: ${report.totalPassed} passed, ${report.totalFailed} failed/blocked, ${report.totalSkipped} review`);
