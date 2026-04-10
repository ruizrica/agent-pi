// ABOUTME: Shared toolkit CLI metadata, worker-model resolution, and worker spawning.
// ABOUTME: Toolkit agents represent installed CLI software and should stream real CLI stdout/stderr.

import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { isClaudeCliAgent, toClaudeProfileName } from "./claude-config.ts";
import { spawnClaudeCli } from "./claude-cli.ts";
import { buildClaudeContextPacket } from "./claude-context.ts";
import { buildCursorCliArgs } from "./cursor-cli.ts";
import { buildCodexCliArgs } from "./codex-cli.ts";
import { buildDroidCliArgs } from "./droid-cli.ts";
import { buildGeminiCliArgs } from "./gemini-cli.ts";
import { buildOpenCodeCliArgs } from "./opencode-cli.ts";

export const TOOLKIT_CLI_AGENT_ALIASES = new Map<string, string>([
	["cursor-agent", "cursor-worker"],
	["codex-agent", "codex-worker"],
	["droid-agent", "droid-worker"],
	["gemini-agent", "gemini-worker"],
	["opencode-agent", "opencode-worker"],
]);

export const TOOLKIT_CLI_AGENTS = new Set([
	"cursor-worker",
	"cursor-agent",
	"codex-worker",
	"codex-agent",
	"gemini-worker",
	"gemini-agent",
	"qwen-agent",
	"opencode-worker",
	"opencode-agent",
	"groq-agent",
	"droid-worker",
	"droid-agent",
	"crush-agent",
	"claude-worker",
	"claude-advisor",
]);

export const TOOLKIT_WORKER_MODEL = "anthropic/claude-haiku-4-5-20251001";

export interface ToolkitWorkerAgentDef {
	name: string;
	tools: string;
	systemPrompt: string;
}

export interface ToolkitWorkerSpawnOptions {
	task: string;
	sessionFile?: string;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	model?: string;
	onStdoutLine?: (line: string) => void;
	onStderr?: (chunk: string) => void;
	onSpawn?: (proc: any) => void;
}

interface ToolkitCliCommand {
	command: string;
	args: (task: string, cwd?: string) => string[];
}

export interface ToolkitWorkerResult {
	exitCode: number;
	elapsed: number;
	output: string;
}

export function normalizeToolkitAgentName(name: string | undefined | null): string {
	if (!name) return "";
	const key = name.toLowerCase();
	return TOOLKIT_CLI_AGENT_ALIASES.get(key) || key;
}

export function isToolkitCliAgent(name: string | undefined | null): boolean {
	if (!name) return false;
	return TOOLKIT_CLI_AGENTS.has(name.toLowerCase());
}

export function resolveToolkitWorkerModel(agentName: string, fallbackModel: string): string {
	if (isClaudeCliAgent(agentName)) return fallbackModel;
	return isToolkitCliAgent(agentName) ? TOOLKIT_WORKER_MODEL : fallbackModel;
}

export function getToolkitWorkerArgs(agentDef: ToolkitWorkerAgentDef, options: ToolkitWorkerSpawnOptions): string[] {
	const extDir = dirname(fileURLToPath(import.meta.url));
	const extensionsDir = join(extDir, "..");
	const tasksExtPath = join(extensionsDir, "tasks.ts");
	const footerExtPath = join(extensionsDir, "footer.ts");
	const memoryCycleExtPath = join(extensionsDir, "memory-cycle.ts");

	const args = [
		"--mode", "json",
		"-p",
		"--no-extensions",
		"-e", tasksExtPath,
		"-e", footerExtPath,
		"-e", memoryCycleExtPath,
		"--model", TOOLKIT_WORKER_MODEL,
		"--tools", agentDef.tools,
		"--thinking", "off",
		"--append-system-prompt", agentDef.systemPrompt,
	];

	if (options.sessionFile) {
		args.push("--session", options.sessionFile);
	}

	args.push(options.task);
	return args;
}

function getToolkitCliCommand(agentName: string): ToolkitCliCommand | null {
	switch (normalizeToolkitAgentName(agentName)) {
		case "cursor-worker":
			return {
				command: "cursor-agent",
				args: (task: string, cwd?: string) => buildCursorCliArgs(task, cwd),
			};
		case "codex-worker":
			return {
				command: "codex",
				args: (task: string, cwd?: string) => buildCodexCliArgs(task, cwd),
			};
		case "droid-worker":
			return {
				command: "droid",
				args: (task: string, cwd?: string) => buildDroidCliArgs(task, cwd),
			};
		case "gemini-worker":
			return {
				command: "gemini",
				args: (task: string) => buildGeminiCliArgs(task),
			};
		case "opencode-worker":
			return {
				command: "opencode",
				args: (task: string, cwd?: string) => buildOpenCodeCliArgs(task, cwd),
			};
		case "qwen-agent":
			return {
				command: "qwen",
				args: (task: string) => [task],
			};
		case "opencode-agent":
			return {
				command: "opencode",
				args: (task: string) => ["-p", task],
			};
		case "groq-agent":
			return {
				command: "groq",
				args: (task: string) => [task],
			};
		case "crush-agent":
			return {
				command: "crush",
				args: (task: string) => [task],
			};
		default:
			return null;
	}
}

export function spawnToolkitWorker(
	agentDef: ToolkitWorkerAgentDef,
	options: ToolkitWorkerSpawnOptions,
): Promise<ToolkitWorkerResult> {
	if (isClaudeCliAgent(agentDef.name)) {
		const hasContextPrefix = options.task.includes("## Working Context") || options.task.includes("Working directory:");
		return spawnClaudeCli({
			profile: toClaudeProfileName(agentDef.name),
			task: options.task,
			cwd: options.cwd,
			env: options.env,
			model: options.model,
			tools: agentDef.tools,
			systemPrompt: agentDef.systemPrompt,
			contextPacket: hasContextPrefix
				? options.task
				: buildClaudeContextPacket({
					cwd: options.cwd || process.cwd(),
					task: options.task,
				}),
			onSpawn: options.onSpawn,
			onTextDelta: (text: string) => {
				if (!text) return;
				options.onStdoutLine?.(JSON.stringify({
					type: "message_update",
					assistantMessageEvent: {
						type: "text_delta",
						delta: text,
					},
				}));
			},
			onToolStart: (toolName: string) => options.onStdoutLine?.(JSON.stringify({ type: "tool_execution_start", tool: toolName })),
			onStderr: options.onStderr,
		}).then(({ exitCode, elapsed, output, result }) => ({
			exitCode,
			elapsed,
			output: result || output,
		}));
	}

	return new Promise((resolve) => {
		const cliCommand = getToolkitCliCommand(agentDef.name);
		const command = cliCommand?.command || "pi";
		const args = cliCommand
			? cliCommand.args(options.task, options.cwd)
			: getToolkitWorkerArgs(agentDef, options);
		const proc = spawn(command, args, {
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, ...options.env, PI_SUBAGENT: "1" },
			cwd: options.cwd,
		});
		options.onSpawn?.(proc);

		const startTime = Date.now();
		let output = "";
		let buffer = "";

		proc.stdout?.setEncoding("utf-8");
		proc.stdout?.on("data", (chunk: string) => {
			output += chunk;
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				if (line.trim()) options.onStdoutLine?.(line);
			}
		});

		proc.stderr?.setEncoding("utf-8");
		proc.stderr?.on("data", (chunk: string) => {
			output += chunk;
			if (chunk) options.onStderr?.(chunk);
			const lines = chunk.split("\n");
			for (const line of lines) {
				if (line.trim()) options.onStdoutLine?.(line);
			}
		});

		proc.on("error", (err) => {
			const msg = `CLI spawn error (${command}): ${err.message}`;
			options.onStderr?.(msg);
			options.onStdoutLine?.(msg);
			resolve({
				exitCode: 1,
				elapsed: Date.now() - startTime,
				output: msg,
			});
		});

		proc.on("close", (code) => {
			if (buffer.trim()) options.onStdoutLine?.(buffer);
			resolve({
				exitCode: code ?? 1,
				elapsed: Date.now() - startTime,
				output,
			});
		});
	});
}
