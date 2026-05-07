// ABOUTME: CLI-backed Anthropic provider stream for top-level Pi Claude turns.
// ABOUTME: Ensures Claude-family model requests use the local Claude CLI instead of direct SDK/API.

import {
	AssistantMessageEventStream,
	type Api,
	type AssistantMessage,
	type Context,
	type ImageContent,
	type Message,
	type Model,
	type SimpleStreamOptions,
	type TextContent,
} from "@mariozechner/pi-ai";
import { spawnClaudeCli } from "./claude-cli.ts";
import { buildClaudeContextPacket } from "./claude-context.ts";
import { isClaudeFamilyModel } from "../toolkit-cli.ts";

export const DIRECT_CLAUDE_BLOCKED_MESSAGE =
	"Direct Anthropic SDK/API routing is disabled for Claude-family models. " +
	"This request must use the local Claude CLI subprocess.";

function emptyUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function textFromContent(content: string | (TextContent | ImageContent)[]): string {
	if (typeof content === "string") return content;
	return content.map((block) => {
		if (block.type === "text") return block.text;
		return `[image:${block.mimeType};base64 omitted]`;
	}).join("\n");
}

function serializeMessage(message: Message): string {
	if (message.role === "user") {
		return `User:\n${textFromContent(message.content)}`;
	}
	if (message.role === "assistant") {
		const text = message.content.map((block) => {
			if (block.type === "text") return block.text;
			if (block.type === "thinking") return `[thinking omitted]`;
			return `[tool call:${block.name}] ${JSON.stringify(block.arguments)}`;
		}).filter(Boolean).join("\n");
		return `Assistant:\n${text}`;
	}
	const text = message.content.map((block) => {
		if (block.type === "text") return block.text;
		return `[image:${block.mimeType};base64 omitted]`;
	}).join("\n");
	return `Tool result (${message.toolName}, ${message.isError ? "error" : "ok"}):\n${text}`;
}

export function isDirectClaudeModel(model: Pick<Model<Api>, "provider" | "id"> | undefined | null): boolean {
	if (!model) return false;
	return model.provider === "anthropic" && isClaudeFamilyModel(model.id);
}

const VIEWER_SUBSTITUTIONS_BLOCK = [
	"## Viewer Substitutions (agent-viewer CLI)",
	"You are running inside the Claude Code CLI subprocess spawned by Pi. The Pi-only viewer tools `show_plan`, `show_spec`, `show_report`, and `show_reports` are NOT callable here. Present plans, specs, completion summaries, and the reports browser through the local `agent-viewer` CLI via the Bash tool. The CLI opens the same browser viewer Pi would, lets the user edit/comment/approve, and prints a JSON result on stdout when invoked with `--json`.",
	"",
	"Mapping (always pass `--json` so you can read the user's decision back):",
	"- `show_plan { file_path: \".context/todo.md\" }` → `agent-viewer plan --file .context/todo.md --json`",
	"- `show_plan { file_path, mode: \"questions\" }` → `agent-viewer plan --file <path> --mode questions --json`",
	"- `show_spec { folder_path: \"<spec-dir>\" }` → `agent-viewer spec --folder <spec-dir> --json`",
	"- `show_report { ... }` → `agent-viewer completion --json` (write the report markdown to disk first and pass it via `--file` or `--stdin`)",
	"- `show_reports { ... }` → `agent-viewer reports --json`",
	"",
	"Always: write the source markdown/spec to disk first, run the matching `agent-viewer` command with `--json`, and parse the JSON result for the user's approval, edits, or answers before continuing. If `agent-viewer` is missing, say so explicitly instead of pretending the viewer opened.",
].join("\n");

export function buildClaudeProviderPrompt(context: Context): string {
	const lines: string[] = [];
	if (context.systemPrompt?.trim()) {
		lines.push("## System Prompt");
		lines.push(context.systemPrompt.trim());
	}
	lines.push(VIEWER_SUBSTITUTIONS_BLOCK);
	if (context.tools?.length) {
		lines.push("## Pi Tool Surface");
		lines.push("The surrounding Pi session may expose these tool names, but this Claude CLI provider does not call Pi's direct SDK/API path.");
		for (const tool of context.tools) {
			lines.push(`- ${tool.name}: ${tool.description}`);
		}
	}
	lines.push("## Conversation");
	lines.push(...context.messages.map(serializeMessage));
	return lines.join("\n\n");
}

export function streamClaudeCliProvider(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const stream = new AssistantMessageEventStream();
	const output: AssistantMessage = {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: emptyUsage(),
		stopReason: "stop",
		timestamp: Date.now(),
	};

	(async () => {
		try {
			if (!isDirectClaudeModel(model)) {
				throw new Error(DIRECT_CLAUDE_BLOCKED_MESSAGE);
			}
			if (options?.signal?.aborted) throw new Error("Request was aborted");

			const prompt = buildClaudeProviderPrompt(context);
			const contextPacket = buildClaudeContextPacket({
				cwd: process.cwd(),
				task: prompt,
			});

			stream.push({ type: "start", partial: output });
			const textBlock = { type: "text" as const, text: "" };
			output.content.push(textBlock);
			stream.push({ type: "text_start", contentIndex: 0, partial: output });

			const result = await spawnClaudeCli({
				profile: "claude-worker",
				task: prompt,
				cwd: process.cwd(),
				model: model.id,
				contextPacket,
				signal: options?.signal,
				onTextDelta: (delta) => {
					if (!delta) return;
					textBlock.text += delta;
					stream.push({ type: "text_delta", contentIndex: 0, delta, partial: output });
				},
				onStderr: () => {},
			});

			if (result.exitCode !== 0) {
				throw new Error((result.result || result.output || "Claude CLI execution failed").trim());
			}
			if (!textBlock.text && (result.result || result.output)) {
				const finalText = result.result || result.output;
				textBlock.text = finalText;
				stream.push({ type: "text_delta", contentIndex: 0, delta: finalText, partial: output });
			}

			stream.push({ type: "text_end", contentIndex: 0, content: textBlock.text, partial: output });
			output.stopReason = options?.signal?.aborted ? "aborted" : "stop";
			if (output.stopReason === "aborted") {
				throw new Error("Request was aborted");
			}
			stream.push({ type: "done", reason: "stop", message: output });
			stream.end();
		} catch (error) {
			const reason = options?.signal?.aborted ? "aborted" : "error";
			output.stopReason = reason;
			output.errorMessage = error instanceof Error ? error.message : String(error);
			stream.push({ type: "error", reason, error: output });
			stream.end();
		}
	})();

	return stream;
}
