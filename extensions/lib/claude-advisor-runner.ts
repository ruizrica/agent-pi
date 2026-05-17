// ABOUTME: Shared Claude advisor runner used by the claude_advisor tool and /advisor command.
// ABOUTME: Builds context packets, invokes Anthropic provider routing, and normalizes advisor output.

import { spawn } from "child_process";
import { buildAdvisorPrompt, normalizeAdvisorResponse } from "./claude-advice-format.ts";
import { buildClaudeContextPacket } from "./claude-context.ts";

export type AdvisorArgs = {
	question: string;
	task_context?: string;
	files?: string[];
	model?: string;
	agent_role?: string;
};

export type AdvisorRunContext = {
	cwd: string;
};

const DEFAULT_ADVISOR_MODEL = "claude-opus-4-7";

async function readProjectCodex(cwd: string): Promise<string | undefined> {
	try {
		const fs = await import("fs");
		const path = await import("path");
		const claudePath = path.join(cwd, "CLAUDE.md");
		if (fs.existsSync(claudePath)) {
			return fs.readFileSync(claudePath, "utf-8");
		}
	} catch {}
	return undefined;
}

function normalizeAnthropicModel(model?: string): string {
	const requested = (model || DEFAULT_ADVISOR_MODEL).trim();
	return requested.toLowerCase().startsWith("anthropic/") ? requested.slice("anthropic/".length) : requested;
}

function runAnthropicAdvisorProcess(args: {
	cwd: string;
	model?: string;
	task: string;
	contextPacket: string;
	systemPrompt: string;
	tools: string;
}, onTextDelta?: (text: string) => void): Promise<string> {
	return new Promise((resolve, reject) => {
		const prompt = [args.contextPacket, args.task].filter(Boolean).join("\n\n");
		const proc = spawn("pi", [
			"--mode",
			"json",
			"-p",
			"--no-extensions",
			"--provider",
			"anthropic",
			"--model",
			normalizeAnthropicModel(args.model),
			"--tools",
			args.tools,
			"--thinking",
			"off",
			"--append-system-prompt",
			args.systemPrompt,
			prompt,
		], {
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, PI_SUBAGENT: "1" },
			cwd: args.cwd,
		});

		let buffer = "";
		let streamed = "";
		let fallback = "";
		let stderr = "";

		const appendText = (text: string) => {
			if (!text) return;
			streamed += text;
			onTextDelta?.(streamed);
		};

		const handleLine = (line: string) => {
			const trimmed = line.trim();
			if (!trimmed) return;
			try {
				const event = JSON.parse(trimmed);
				if (event.type === "message_update") {
					const delta = event.assistantMessageEvent;
					if (delta?.type === "text_delta") appendText(delta.delta || "");
				} else if (event.type === "agent_end") {
					const messages = Array.isArray(event.messages) ? event.messages : [];
					const lastAssistant = [...messages].reverse().find((message: any) => message?.role === "assistant");
					const content = lastAssistant?.content;
					if (!streamed && typeof content === "string") streamed = content;
				}
			} catch {
				fallback += `${trimmed}\n`;
			}
		};

		proc.stdout?.setEncoding("utf-8");
		proc.stdout?.on("data", (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) handleLine(line);
		});
		proc.stderr?.setEncoding("utf-8");
		proc.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});
		proc.on("error", reject);
		proc.on("close", (code) => {
			if (buffer.trim()) handleLine(buffer);
			if (code !== 0) {
				reject(new Error(`Anthropic advisor process exited with code ${code}: ${stderr.trim()}`));
				return;
			}
			resolve((streamed || fallback).trim());
		});
	});
}

export async function runAdvisor(args: AdvisorArgs, ctx: AdvisorRunContext, onTextDelta?: (text: string) => void) {
	const question = args.question.trim();
	const role = args.agent_role?.trim();
	const task = [args.task_context?.trim(), buildAdvisorPrompt(question, role)].filter(Boolean).join("\n\n");
	const claudeDoc = await readProjectCodex(ctx.cwd);
	const contextLines: string[] = [];
	if (claudeDoc) {
		contextLines.push("## Project Codex (CLAUDE.md)");
		contextLines.push(claudeDoc.slice(0, 8000));
	}
	const contextPacket = buildClaudeContextPacket({
		cwd: ctx.cwd,
		task,
		recentSummary: args.task_context,
		fileHints: args.files,
		conversationSummary: contextLines.length ? contextLines.join("\n\n") : undefined,
	});
	const raw = await runAnthropicAdvisorProcess({
		cwd: ctx.cwd,
		model: args.model,
		task,
		tools: "read,grep,find,ls,bash",
		systemPrompt: "You are an advisor. Review the shared context and produce strategic guidance without taking over implementation.",
		contextPacket,
	}, onTextDelta);
	const normalized = normalizeAdvisorResponse(raw);
	const text = [
		`Summary: ${normalized.summary}`,
		`Recommended decision: ${normalized.recommendation}`,
		normalized.risks.length ? `Risks:\n- ${normalized.risks.join("\n- ")}` : "",
		normalized.alternatives.length ? `Alternatives:\n- ${normalized.alternatives.join("\n- ")}` : "",
		normalized.nextActions.length ? `Next actions:\n- ${normalized.nextActions.join("\n- ")}` : "",
	].filter(Boolean).join("\n\n");
	return { normalized, text };
}
