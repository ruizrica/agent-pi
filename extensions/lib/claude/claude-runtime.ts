// ABOUTME: Shared Claude-family runtime helpers for feature-level CLI-backed execution.
// ABOUTME: Lets non-agent features reuse the local Claude Code CLI path without direct SDK/API calls.

import { spawnClaudeCli, type ClaudeCliResult } from "./claude-cli.ts";
import { buildClaudeContextPacket } from "./claude-context.ts";
import { type ClaudeProfileName } from "./claude-config.ts";

export interface ClaudeRuntimeRunOptions {
	profile?: ClaudeProfileName;
	prompt: string;
	cwd?: string;
	model?: string;
	tools?: string;
	systemPrompt?: string;
	contextPacket?: string;
	sessionId?: string;
	resumeMostRecent?: boolean;
	onTextDelta?: (delta: string) => void;
	onOutputLine?: (line: string) => void;
	onStatus?: (status: string) => void;
	onStderr?: (chunk: string) => void;
}

export interface ClaudeRuntimeResult extends ClaudeCliResult {}

export async function runClaudeRuntime(options: ClaudeRuntimeRunOptions): Promise<ClaudeRuntimeResult> {
	const profile = options.profile || "claude-worker";
	const contextPacket = options.contextPacket?.trim()
		? options.contextPacket
		: buildClaudeContextPacket({
			cwd: options.cwd || process.cwd(),
			task: options.prompt,
		});

	return spawnClaudeCli({
		profile,
		task: options.prompt,
		cwd: options.cwd,
		model: options.model,
		tools: options.tools,
		systemPrompt: options.systemPrompt,
		contextPacket,
		sessionId: options.sessionId,
		resumeMostRecent: options.resumeMostRecent,
		onTextDelta: options.onTextDelta,
		onOutputLine: options.onOutputLine,
		onStatus: options.onStatus,
		onStderr: options.onStderr,
	});
}
