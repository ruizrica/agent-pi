#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const targetCwd = process.cwd();

function printJson(value) {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message, details = {}, exitCode = 1) {
	printJson({ ok: false, message, ...details });
	process.exit(exitCode);
}

function parseArgs(argv) {
	const command = argv[2] || "inspect";
	const options = {};
	for (let i = 3; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) continue;
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (!next || next.startsWith("--")) {
			options[key] = true;
			continue;
		}
		options[key] = next;
		i += 1;
	}
	return { command, options };
}

function boolOption(value) {
	if (value === true) return true;
	if (value === false || value === undefined) return false;
	return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function detectAuth() {
	if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
		return { present: true, source: "CLAUDE_CODE_OAUTH_TOKEN" };
	}
	if (process.env.PI_CLAUDE_OAUTH_TOKEN) {
		return { present: true, source: "PI_CLAUDE_OAUTH_TOKEN" };
	}
	if (process.env.ANTHROPIC_OAUTH_TOKEN) {
		return { present: true, source: "ANTHROPIC_OAUTH_TOKEN" };
	}
	return { present: false };
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf-8"));
}

function scanAgentDirs() {
	const dirs = [
		join(repoRoot, "agents"),
		join(repoRoot, ".claude", "agents"),
		join(repoRoot, ".pi", "agents"),
	];
	const agents = new Map();
	for (const dir of dirs) {
		scanAgentDir(dir, agents);
	}
	return agents;
}

function scanAgentDir(dir, agents) {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			scanAgentDir(fullPath, agents);
			continue;
		}
		if (!entry.name.endsWith(".md")) continue;
		const parsed = parseAgentFile(fullPath);
		if (parsed && !agents.has(parsed.name)) {
			agents.set(parsed.name, parsed);
		}
	}
}

function parseAgentFile(filePath) {
	const raw = readFileSync(filePath, "utf-8");
	const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) return null;
	const frontmatter = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx <= 0) continue;
		frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
	}
	if (!frontmatter.name) return null;
	return {
		name: frontmatter.name.toLowerCase(),
		description: frontmatter.description || "",
		tools: frontmatter.tools || "read,grep,find,ls",
		systemPrompt: match[2].trim(),
		file: filePath,
	};
}

function loadModels() {
	const path = join(repoRoot, "agents", "models.json");
	if (!existsSync(path)) {
		return {
			default: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
			agents: {},
		};
	}
	return readJson(path);
}

function resolveModel(agentName, models) {
	const entry = models.agents?.[agentName] || models.default;
	if (!entry) return "anthropic/claude-haiku-4-5-20251001";
	return entry.provider ? `${entry.provider}/${entry.model}` : entry.model;
}

function loadChains() {
	const path = join(repoRoot, "agents", "agent-chain.yaml");
	if (!existsSync(path)) return {};
	return YAML.parse(readFileSync(path, "utf-8")) || {};
}

function requireApproval(mode, writeScope, workerCount) {
	const reasons = [];
	if (writeScope === "broad") reasons.push("broad writes requested");
	if (mode === "batch" || mode === "chain" || mode === "pipeline" || workerCount > 1) {
		reasons.push("multi-agent orchestration requested");
	}
	return reasons;
}

function applyTemplate(template, input, original) {
	return template
		.replace(/\$INPUT/g, input)
		.replace(/\$ORIGINAL/g, original);
}

async function runPiAgent(agent, task, cwd) {
	const models = loadModels();
	const model = resolveModel(agent.name, models);
	const args = [
		"--mode", "json",
		"-p",
		"--no-extensions",
		"--model", model,
		"--tools", agent.tools,
		"--thinking", "off",
		"--append-system-prompt", agent.systemPrompt,
		task,
	];

	return new Promise((resolveRun, rejectRun) => {
		const proc = spawn("pi", args, {
			cwd,
			env: { ...process.env, PI_SUBAGENT: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdoutBuffer = "";
		let output = "";
		let stderr = "";

		proc.stdout.setEncoding("utf-8");
		proc.stdout.on("data", (chunk) => {
			stdoutBuffer += chunk;
			const lines = stdoutBuffer.split("\n");
			stdoutBuffer = lines.pop() || "";
			for (const line of lines) {
				try {
					const event = JSON.parse(line);
					const delta = event.assistantMessageEvent;
					if (event.type === "message_update" && delta?.type === "text_delta") {
						output += delta.delta || "";
					}
				} catch {
					output += `${line}\n`;
				}
			}
		});

		proc.stderr.setEncoding("utf-8");
		proc.stderr.on("data", (chunk) => {
			stderr += chunk;
		});

		proc.on("error", (error) => rejectRun(error));
		proc.on("close", (code) => {
			if (stdoutBuffer.trim()) {
				output += stdoutBuffer;
			}
			resolveRun({
				agent: agent.name,
				model,
				exitCode: code ?? 1,
				output: output.trim(),
				stderr: stderr.trim(),
			});
		});
	});
}

async function runDispatch(options) {
	const agents = scanAgentDirs();
	const agentName = String(options.agent || "").toLowerCase();
	const task = String(options.task || "").trim();
	const cwd = options.cwd ? resolve(String(options.cwd)) : targetCwd;
	const writeScope = String(options["write-scope"] || "narrow");
	const execute = boolOption(options.execute);
	const approvalReasons = requireApproval("dispatch", writeScope, 1);

	if (!agentName || !task) {
		fail("dispatch requires --agent and --task", { command: "dispatch" });
	}
	const agent = agents.get(agentName);
	if (!agent) {
		fail("unknown agent", { command: "dispatch", agent: agentName, availableAgents: [...agents.keys()].sort() }, 2);
	}

	if (!execute) {
		printJson({
			ok: true,
			command: "dispatch",
			agent: agentName,
			cwd,
			requiresApproval: approvalReasons.length > 0,
			approvalReasons,
			executable: true,
		});
		return;
	}
	if (approvalReasons.length > 0 && !boolOption(options.approved)) {
		fail("approval required before execution", { command: "dispatch", approvalReasons }, 2);
	}

	const result = await runPiAgent(agent, task, cwd);
	printJson({ ok: result.exitCode === 0, command: "dispatch", cwd, ...result });
}

async function runBatch(options) {
	const agents = scanAgentDirs();
	const specPath = options.spec ? resolve(String(options.spec)) : "";
	const cwd = options.cwd ? resolve(String(options.cwd)) : targetCwd;
	const execute = boolOption(options.execute);
	if (!specPath || !existsSync(specPath)) {
		fail("batch requires --spec pointing to a JSON file", { command: "batch" });
	}

	const workers = readJson(specPath);
	if (!Array.isArray(workers) || workers.length === 0) {
		fail("batch spec must be a non-empty JSON array", { command: "batch", specPath });
	}

	const approvalReasons = requireApproval("batch", String(options["write-scope"] || "narrow"), workers.length);
	if (!execute) {
		printJson({
			ok: true,
			command: "batch",
			cwd,
			specPath,
			workerCount: workers.length,
			requiresApproval: true,
			approvalReasons,
			executable: true,
		});
		return;
	}
	if (!boolOption(options.approved)) {
		fail("approval required before execution", { command: "batch", approvalReasons }, 2);
	}

	const results = await Promise.all(workers.map(async (worker) => {
		const agentName = String(worker.name || worker.agent || "").toLowerCase();
		const task = String(worker.task || "").trim();
		const agent = agents.get(agentName);
		if (!agent) {
			return { ok: false, agent: agentName, exitCode: 1, output: "", stderr: "unknown agent" };
		}
		return runPiAgent(agent, task, cwd);
	}));

	printJson({
		ok: results.every((result) => result.exitCode === 0),
		command: "batch",
		cwd,
		workerCount: workers.length,
		results,
	});
}

async function runChainCommand(options) {
	const agents = scanAgentDirs();
	const chains = loadChains();
	const chainName = String(options.chain || "").trim();
	const task = String(options.task || "").trim();
	const cwd = options.cwd ? resolve(String(options.cwd)) : targetCwd;
	const execute = boolOption(options.execute);

	if (!chainName || !task) {
		fail("chain requires --chain and --task", { command: "chain", availableChains: Object.keys(chains).sort() });
	}
	const chain = chains[chainName];
	if (!chain) {
		fail("unknown chain", { command: "chain", chain: chainName, availableChains: Object.keys(chains).sort() }, 2);
	}

	const approvalReasons = requireApproval("chain", String(options["write-scope"] || "narrow"), Array.isArray(chain.steps) ? chain.steps.length : 0);
	if (!execute) {
		printJson({
			ok: true,
			command: "chain",
			chain: chainName,
			cwd,
			requiresApproval: true,
			approvalReasons,
			executable: true,
		});
		return;
	}
	if (!boolOption(options.approved)) {
		fail("approval required before execution", { command: "chain", approvalReasons }, 2);
	}

	let input = task;
	const steps = [];
	for (const step of chain.steps || []) {
		const agentName = String(step.agent || "").toLowerCase();
		const agent = agents.get(agentName);
		if (!agent) {
			fail("chain references unknown agent", { command: "chain", chain: chainName, agent: agentName }, 2);
		}
		const prompt = applyTemplate(String(step.prompt || "$INPUT"), input, task);
		const result = await runPiAgent(agent, prompt, cwd);
		steps.push({ agent: agentName, exitCode: result.exitCode, output: result.output, stderr: result.stderr, model: result.model });
		if (result.exitCode !== 0) {
			printJson({ ok: false, command: "chain", chain: chainName, cwd, steps, output: result.output });
			return;
		}
		input = result.output;
	}

	printJson({ ok: true, command: "chain", chain: chainName, cwd, steps, output: input });
}

function runPlan(options) {
	const requestedMode = String(options.mode || "auto");
	const agentCount = Number(options["agent-count"] || 0);
	const phaseCount = Number(options["phase-count"] || 0);
	const sequential = boolOption(options.sequential);
	const parallel = boolOption(options.parallel);
	let mode = requestedMode;
	if (mode === "auto") {
		if (phaseCount >= 3) mode = "pipeline";
		else if (sequential || options.chain || phaseCount >= 2) mode = "chain";
		else if (parallel || agentCount > 1) mode = "batch";
		else mode = "dispatch";
	}
	const approvalReasons = requireApproval(mode, String(options["write-scope"] || "none"), agentCount);
	printJson({
		ok: true,
		command: "plan",
		mode,
		requiresApproval: approvalReasons.length > 0,
		approvalReasons,
		supportedExecution: ["dispatch", "batch", "chain"].includes(mode),
		note: mode === "pipeline" ? "pipeline is currently a planning contract; use chain or batch execution in v1" : undefined,
	});
}

function runInspect() {
	const agents = [...scanAgentDirs().keys()].sort();
	const chains = Object.keys(loadChains()).sort();
	const auth = detectAuth();
	printJson({
		ok: true,
		repoRoot,
		targetCwd,
		auth,
		agents,
		chains,
		supportedModes: ["dispatch", "batch", "chain", "pipeline"],
		approvalPolicy: {
			broadWrites: true,
			multiAgentExecution: true,
		},
	});
}

async function main() {
	const { command, options } = parseArgs(process.argv);
	if (command === "inspect" || command === "status") {
		runInspect();
		return;
	}
	if (command === "plan") {
		runPlan(options);
		return;
	}
	if (command === "dispatch") {
		await runDispatch(options);
		return;
	}
	if (command === "batch") {
		await runBatch(options);
		return;
	}
	if (command === "chain") {
		await runChainCommand(options);
		return;
	}
	if (command === "pipeline") {
		printJson({
			ok: true,
			command: "pipeline",
			supportedExecution: false,
			note: "pipeline is currently exposed as a planning contract. Use plan/chain/batch in v1.",
		});
		return;
	}
	fail("unknown command", { command, supportedCommands: ["inspect", "status", "plan", "dispatch", "batch", "chain", "pipeline"] }, 2);
}

main().catch((error) => {
	fail(error instanceof Error ? error.message : String(error), { stack: error instanceof Error ? error.stack : undefined }, 1);
});
