#!/usr/bin/env node

// Demo script for the Interfaze provider registered in extensions/interfaze.ts.
// It mirrors the implemented Pi provider config and model defaults from extensions/lib/interfaze-models.ts.

const PROVIDER_NAME = "interfaze";
const BASE_URL = "https://api.interfaze.ai/v1";
const DEFAULT_MODEL = "interfaze-beta";
const DEFAULT_PROMPT = "Say hello from Interfaze.";
const REQUIRED_ENV = "INTERFAZE_API_KEY";

function parseArgs(argv) {
	const result = {
		live: false,
		model: DEFAULT_MODEL,
		prompt: DEFAULT_PROMPT,
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--live") {
			result.live = true;
			continue;
		}
		if (arg === "--model" && argv[i + 1]) {
			result.model = argv[i + 1];
			i += 1;
			continue;
		}
		if (arg === "--prompt" && argv[i + 1]) {
			result.prompt = argv[i + 1];
			i += 1;
			continue;
		}
	}

	return result;
}

function buildPayload(model, prompt) {
	return {
		model,
		messages: [{ role: "user", content: prompt }],
		max_completion_tokens: 512,
	};
}

function printDryRun(config) {
	console.log(`Provider: ${PROVIDER_NAME}`);
	console.log(`Endpoint: ${BASE_URL}/chat/completions`);
	console.log(`Model: ${config.model}`);
	console.log(`Required env var: ${REQUIRED_ENV}`);
	console.log("Mode: dry-run (no network request will be made)");
	console.log("");
	console.log("Example request payload:");
	console.log(JSON.stringify(buildPayload(config.model, config.prompt), null, 2));
	console.log("");
	console.log(`To run live: export ${REQUIRED_ENV}=\"your-api-key-here\" && node scripts/demo-interfaze-provider.mjs --live --prompt \"${config.prompt}\"`);
}

async function runLive(config) {
	const apiKey = process.env[REQUIRED_ENV];
	if (!apiKey) {
		console.error(`Missing ${REQUIRED_ENV}.`);
		console.error(`Set it first, then rerun: export ${REQUIRED_ENV}=\"your-api-key-here\"`);
		process.exitCode = 1;
		return;
	}

	const response = await fetch(`${BASE_URL}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(buildPayload(config.model, config.prompt)),
	});

	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		console.error("Interfaze request failed:");
		console.error(JSON.stringify({ status: response.status, statusText: response.statusText, payload }, null, 2));
		process.exitCode = 1;
		return;
	}

	const message = payload?.choices?.[0]?.message?.content;
	if (typeof message === "string") {
		console.log(message);
		return;
	}

	console.log(JSON.stringify(payload, null, 2));
}

async function main() {
	const config = parseArgs(process.argv.slice(2));
	if (!config.live) {
		printDryRun(config);
		return;
	}
	await runLive(config);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
