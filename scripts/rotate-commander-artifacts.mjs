#!/usr/bin/env node
// ABOUTME: Manual rotation tool for .commander/claims.json and .commander/comments.json sidecars.
// ABOUTME: Trims unbounded audit/comment arrays. Threshold-gated; no-op until file exceeds size cap.
//
// Usage:
//   node scripts/rotate-commander-artifacts.mjs                # rotate at default 5 MB threshold
//   node scripts/rotate-commander-artifacts.mjs --dry-run      # report what would be rotated
//   node scripts/rotate-commander-artifacts.mjs --threshold=1  # MB (use to force rotation now)
//   node scripts/rotate-commander-artifacts.mjs --root=/path   # alternate repo root
//
// This script is NOT auto-invoked. Wire into a hook only after Ricardo decides
// rotation cadence is acceptable (silently discarding audit rows is a behavior
// change vs. commander-v2's current "never delete" semantics).

import { existsSync, readFileSync, renameSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// --- inlined pure rotation logic ---------------------------------------------
// Kept in sync with extensions/lib/commander/rotate-sidecars.ts; .mjs cannot
// import .ts directly without a build step, and adding one for one script is
// over-engineering. The vitest test in extensions/__tests__/rotate-sidecars.test.ts
// covers the canonical TS implementation.

const DEFAULT_LIMITS = { maxAuditRows: 500, maxCommentsPerBead: 100 };

function rotateClaims(state, limits) {
	const audit = state.audit ?? [];
	if (audit.length <= limits.maxAuditRows) return state;
	return {
		nextAuditId: state.nextAuditId,
		byBead: state.byBead,
		audit: audit.slice(audit.length - limits.maxAuditRows),
	};
}

function rotateComments(state, limits) {
	const byBead = state.byBead ?? {};
	const next = {};
	let changed = false;
	for (const beadId of Object.keys(byBead)) {
		const arr = byBead[beadId] ?? [];
		if (arr.length > limits.maxCommentsPerBead) {
			next[beadId] = arr.slice(arr.length - limits.maxCommentsPerBead);
			changed = true;
		} else {
			next[beadId] = arr;
		}
	}
	if (!changed) return state;
	return { nextId: state.nextId, byBead: next };
}

// --- atomic file IO ----------------------------------------------------------

function atomicWriteJson(target, value) {
	const dir = path.dirname(target);
	mkdirSync(dir, { recursive: true });
	const tmp = `${target}.rotate.tmp`;
	writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
	renameSync(tmp, target);
}

function fmtMB(bytes) {
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
	const opts = { dryRun: false, thresholdMB: 5, root: process.cwd() };
	for (const a of argv.slice(2)) {
		if (a === "--dry-run") opts.dryRun = true;
		else if (a.startsWith("--threshold=")) opts.thresholdMB = Number(a.slice("--threshold=".length));
		else if (a.startsWith("--root=")) opts.root = a.slice("--root=".length);
		else if (a === "--help" || a === "-h") {
			process.stdout.write(
				`Usage: rotate-commander-artifacts.mjs [--dry-run] [--threshold=MB] [--root=PATH]\n`,
			);
			process.exit(0);
		}
	}
	return opts;
}

function processFile(filePath, rotator, label, opts) {
	if (!existsSync(filePath)) {
		console.log(`[${label}] skip: not present at ${filePath}`);
		return;
	}
	const sizeBytes = statSync(filePath).size;
	const thresholdBytes = opts.thresholdMB * 1024 * 1024;
	if (sizeBytes < thresholdBytes) {
		console.log(`[${label}] skip: ${fmtMB(sizeBytes)} < threshold ${fmtMB(thresholdBytes)}`);
		return;
	}
	let parsed;
	try {
		parsed = JSON.parse(readFileSync(filePath, "utf8"));
	} catch (err) {
		console.error(`[${label}] parse error, aborting: ${err.message}`);
		process.exitCode = 1;
		return;
	}
	const rotated = rotator(parsed, DEFAULT_LIMITS);
	if (rotated === parsed) {
		console.log(`[${label}] no-op: in-memory array already within limits`);
		return;
	}
	if (opts.dryRun) {
		console.log(`[${label}] would rotate ${fmtMB(sizeBytes)} (dry-run, no write)`);
		return;
	}
	atomicWriteJson(filePath, rotated);
	const newSize = statSync(filePath).size;
	console.log(`[${label}] rotated: ${fmtMB(sizeBytes)} -> ${fmtMB(newSize)}`);
}

function main() {
	const opts = parseArgs(process.argv);
	const dir = path.join(opts.root, ".commander");
	processFile(path.join(dir, "claims.json"), rotateClaims, "claims", opts);
	processFile(path.join(dir, "comments.json"), rotateComments, "comments", opts);
}

main();
