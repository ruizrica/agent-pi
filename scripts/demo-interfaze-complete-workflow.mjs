#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const REQUIRED_FILES = [
	"extensions/interfaze.ts",
	"extensions/lib/interfaze-models.ts",
	"scripts/check-interfaze-provider-loaded.mjs",
	"scripts/demo-interfaze-provider.mjs",
];
const DEFAULT_MODEL = "interfaze-beta";

function parseArgs(argv) {
	const result = {
		live: false,
		model: DEFAULT_MODEL,
		prompt: "Say hello from Interfaze.",
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--live") {
			result.live = true;
			continue;
		}
		if (arg === "--prompt" && argv[i + 1]) {
			result.prompt = argv[i + 1];
			i += 1;
		}
	}

	return result;
}

function run(command, args, options = {}) {
	return spawnSync(command, args, {
		encoding: "utf8",
		stdio: "pipe",
		...options,
	});
}

function printSection(title) {
	console.log(`\n== ${title} ==`);
}

function ensureFiles() {
	const missing = REQUIRED_FILES.filter((file) => !existsSync(file));
	if (missing.length > 0) {
		console.error("Missing required Interfaze files:");
		for (const file of missing) {
			console.error(`- ${file}`);
		}
		process.exitCode = 1;
		return false;
	}
	return true;
}

function checkSyntax() {
	printSection("Syntax checks");
	const checks = [
		"scripts/demo-interfaze-provider.mjs",
		"scripts/check-interfaze-provider-loaded.mjs",
	];
	for (const file of checks) {
		const result = run("node", ["--check", file]);
		if (result.status !== 0) {
			console.error(result.stderr.trim() || result.stdout.trim() || `node --check failed for ${file}`);
			return false;
		}
		console.log(`OK: ${file}`);
	}
	return true;
}

function runLoadCheck() {
	printSection("Provider load check");
	const result = run("node", ["scripts/check-interfaze-provider-loaded.mjs"]);
	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	return result.status === 0;
}

function runDryRun() {
	printSection("Dry-run demo");
	const result = run("node", ["scripts/demo-interfaze-provider.mjs"]);
	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	return result.status === 0;
}

function runLive(prompt) {
	printSection("Live demo");
	if (!process.env.INTERFAZE_API_KEY) {
		console.error('Missing INTERFAZE_API_KEY. Set it before running --live.');
		return false;
	}
	const result = run("node", ["scripts/demo-interfaze-provider.mjs", "--live", "--prompt", prompt], {
		env: process.env,
	});
	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	return result.status === 0;
}

function main() {
	const config = parseArgs(process.argv.slice(2));
	if (!ensureFiles()) return;
	if (!checkSyntax()) {
		process.exitCode = 1;
		return;
	}
	if (!runLoadCheck()) {
		process.exitCode = 1;
		return;
	}
	if (!runDryRun()) {
		process.exitCode = 1;
		return;
	}
	console.log(`Interfaze model: ${config.model}`);
	if (config.live && !runLive(config.prompt)) {
		process.exitCode = 1;
		return;
	}
	console.log("\nInterfaze complete workflow finished.");
}

main();
