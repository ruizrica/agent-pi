#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const SEARCH = "interfaze";
const MODEL_ID = "interfaze-beta";

function runCommand() {
	return spawnSync("pi", ["--list-models", SEARCH], {
		encoding: "utf8",
		env: process.env,
	});
}

function printSuccess(output) {
	console.log("Interfaze provider loaded; found interfaze-beta.");
	console.log("");
	if (output.trim()) {
		console.log(output.trim());
		console.log("");
	}
	console.log("Next steps:");
	console.log('  node scripts/demo-interfaze-provider.mjs');
	console.log('  export INTERFAZE_API_KEY="your-api-key-here"');
	console.log('  node scripts/demo-interfaze-provider.mjs --live --prompt "Say hello from Interfaze."');
}

function printFailure(result) {
	console.error("Interfaze provider not found in pi --list-models.");
	console.error("");
	if (result.stdout.trim()) {
		console.error("stdout:");
		console.error(result.stdout.trim());
		console.error("");
	}
	if (result.stderr.trim()) {
		console.error("stderr:");
		console.error(result.stderr.trim());
		console.error("");
	}
	console.error("Troubleshooting:");
	console.error("- ensure the repository extensions are loaded from package.json");
	console.error("- ensure extensions/interfaze.ts exists");
	console.error("- run from the repository root");
	console.error("- set INTERFAZE_API_KEY before making live requests");
	process.exitCode = 1;
}

function main() {
	const result = runCommand();
	if (result.error) {
		console.error(`Failed to run pi: ${result.error.message}`);
		process.exitCode = 1;
		return;
	}

	const output = `${result.stdout}\n${result.stderr}`;
	if (result.status !== 0 && !output.includes(MODEL_ID)) {
		printFailure(result);
		return;
	}

	if (output.includes(MODEL_ID)) {
		printSuccess(result.stdout);
		return;
	}

	printFailure(result);
}

main();
