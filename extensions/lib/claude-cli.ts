// ABOUTME: Shared Claude Code CLI runtime for worker and advisor profiles.
// ABOUTME: Handles arg construction, stream-json parsing, and normalized event callbacks.

import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { buildClaudeContextPacket } from "./claude-context.ts";
import { resolveClaudeProfileConfig, type ClaudeProfileName } from "./claude-config.ts";
import { resolveClaudeAllowedTools } from "./claude-tool-mapping.ts";

const TOOL_CHATTER_PATTERNS = [
	"mcp__commander__commander_mailbox",
	"[tool]",
	"[tool:",
];

export interface ClaudeCliSpawnOptions {
	profile: ClaudeProfileName;
	task: string;
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	model?: string;
	tools?: string;
	systemPrompt?: string;
	contextPacket?: string;
	sessionId?: string;
	resumeMostRecent?: boolean;
	onSpawn?: (proc: ChildProcessWithoutNullStreams) => void;
	onTextDelta?: (text: string) => void;
	onOutputLine?: (line: string) => void;
	onToolStart?: (toolName: string) => void;
	onToolResult?: (toolName: string, status?: string) => void;
	onStatus?: (status: string) => void;
	onStderr?: (chunk: string) => void;
}

export interface ClaudeCliResult {
	exitCode: number;
	elapsed: number;
	output: string;
	result: string;
	sessionId?: string;
}

function contentTextFromAssistantMessage(message: any): string {
	const content = Array.isArray(message?.content) ? message.content : [];
	return content
		.filter((block: any) => block?.type === "text" && typeof block.text === "string")
		.map((block: any) => block.text)
		.join("\n")
		.trim();
}

function normalizeClaudeModel(model: string | undefined): string | undefined {
	if (!model) return model;
	return model.startsWith("anthropic/") ? model.slice("anthropic/".length) : model;
}

export function isClaudeDisplayNoise(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed) return true;
	return TOOL_CHATTER_PATTERNS.some((pattern) => trimmed.includes(pattern));
}

function extractPreviewLine(line: string): string | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("{")) {
		try {
			const event = JSON.parse(trimmed);
			if (event?.type === "result" && typeof event.result === "string") {
				return event.result.trim();
			}
			if (event?.type === "assistant") {
				const text = contentTextFromAssistantMessage(event.message);
				return text || null;
			}
			if (event?.type === "system" && event.subtype === "hook_response" && typeof event.stdout === "string") {
				const stdout = event.stdout.trim();
				if (!stdout) return null;
				try {
					const payload = JSON.parse(stdout);
					const systemMessage = payload?.systemMessage;
					if (typeof systemMessage === "string") {
						if (systemMessage.toLowerCase().includes("warp plugin installed")) return null;
						return systemMessage.trim();
					}
				} catch {}
				return stdout;
			}
			if (event?.type === "stream_event" && event.event?.type === "content_block_start" && event.event.content_block?.type === "tool_use") {
				return `[tool] ${event.event.content_block.name || "running"}`;
			}
			return null;
		} catch {
			return trimmed;
		}
	}
	return trimmed;
}

export function dedupePreserveOrder(lines: string[]): string[] {
	const result: string[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (result[result.length - 1] === trimmed) continue;
		result.push(trimmed);
	}
	return result;
}

export function buildClaudeCliArgs(options: ClaudeCliSpawnOptions): string[] {
	const config = resolveClaudeProfileConfig(options.profile, {
		model: normalizeClaudeModel(options.model),
	});
	const args: string[] = ["-p"];
	if (config.verbose !== false) args.push("--verbose");
	args.push("--output-format", "stream-json");
	if (config.includePartialMessages !== false) args.push("--include-partial-messages");
	if (config.noSessionPersistence !== false) {
		args.push("--no-session-persistence");
	} else if (options.sessionId) {
		args.push("--session-id", options.sessionId);
	} else if (options.resumeMostRecent) {
		args.push("--continue");
	}
	if (config.permissionMode) args.push("--permission-mode", config.permissionMode);
	if (config.dangerouslySkipPermissions) args.push("--dangerously-skip-permissions");
	if (config.model) args.push("--model", config.model);
	if (options.cwd) args.push("--add-dir", options.cwd);
	if (typeof config.maxBudgetUsd === "number") {
		args.push("--max-budget-usd", String(config.maxBudgetUsd));
	}

	const allowedTools = resolveClaudeAllowedTools(options.profile, options.tools, config.allowedTools);
	if (allowedTools.length > 0) {
		args.push("--allowedTools", allowedTools.join(","));
	}

	if (options.systemPrompt?.trim()) {
		args.push("--append-system-prompt", options.systemPrompt.trim());
	}

	const prompt = options.contextPacket?.trim()
		? options.contextPacket.trim()
		: buildClaudeContextPacket({ cwd: options.cwd || process.cwd(), task: options.task });
	args.push(prompt);
	return args;
}

export function spawnClaudeCli(options: ClaudeCliSpawnOptions): Promise<ClaudeCliResult> {
	return new Promise((resolve) => {
		const args = buildClaudeCliArgs(options);
		const proc = spawn("claude", args, {
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, ...options.env, PI_SUBAGENT: "1" },
			cwd: options.cwd,
		});
		options.onSpawn?.(proc);

		const startTime = Date.now();
		let output = "";
		let buffer = "";
		let resultText = "";
		let sessionId: string | undefined;
		let activeToolName = "tool";

		const visibleOutputLines: string[] = [];

		const handleLine = (line: string) => {
			output += line + "\n";
			const preview = extractPreviewLine(line);
			if (preview && !isClaudeDisplayNoise(preview)) {
				visibleOutputLines.push(preview.trim());
				options.onOutputLine?.(preview);
			}

			let parsed: any;
			try {
				parsed = JSON.parse(line);
			} catch {
				return;
			}

			if (parsed?.session_id && !sessionId) sessionId = parsed.session_id;

			if (parsed.type === "stream_event") {
				const event = parsed.event;
				if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
					const delta = event.delta.text || "";
					if (delta) {
						resultText += delta;
						options.onTextDelta?.(delta);
					}
				}
				if (event?.type === "content_block_start" && event.content_block?.type === "tool_use") {
					activeToolName = event.content_block.name || activeToolName;
					options.onToolStart?.(activeToolName);
				}
				if (event?.type === "content_block_stop") {
					options.onToolResult?.(activeToolName, "done");
				}
				if (event?.type === "message_delta" && event.delta?.stop_reason) {
					options.onStatus?.(String(event.delta.stop_reason));
				}
				return;
			}

			if (parsed.type === "assistant") {
				const text = contentTextFromAssistantMessage(parsed.message);
				if (text) resultText = text;
				return;
			}

			if (parsed.type === "result") {
				if (typeof parsed.result === "string") resultText = parsed.result;
				options.onStatus?.(parsed.subtype || "result");
				return;
			}

			if (parsed.type === "system" && parsed.subtype && parsed.subtype !== "hook_started") {
				options.onStatus?.(`system:${parsed.subtype}`);
			}
		};

		proc.stdout.setEncoding("utf-8");
		proc.stdout.on("data", (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				if (line.trim()) handleLine(line);
			}
		});

		proc.stderr.setEncoding("utf-8");
		proc.stderr.on("data", (chunk: string) => {
			output += chunk;
			options.onStderr?.(chunk);
			for (const line of chunk.split("\n")) {
				const trimmed = line.trim();
				if (trimmed) options.onOutputLine?.(trimmed);
			}
		});

		proc.on("error", (err) => {
			const message = `Claude CLI spawn error: ${err.message}`;
			options.onStderr?.(message);
			options.onOutputLine?.(message);
			resolve({
				exitCode: 1,
				elapsed: Date.now() - startTime,
				output: message,
				result: message,
				sessionId,
			});
		});

		proc.on("close", (code) => {
			if (buffer.trim()) handleLine(buffer.trim());
			const dedupedVisible = dedupePreserveOrder(visibleOutputLines);
			const finalResult = resultText.trim() || dedupedVisible[dedupedVisible.length - 1] || "";
			resolve({
				exitCode: code ?? 1,
				elapsed: Date.now() - startTime,
				output: output.trim(),
				result: finalResult,
				sessionId,
			});
		});
	});
}
