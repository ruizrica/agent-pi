// ABOUTME: Shared Claude advisor runner used by the claude_advisor tool and /advisor command.
// ABOUTME: Builds context packets, invokes Claude CLI, and normalizes advisor output.

import { buildAdvisorPrompt, normalizeAdvisorResponse } from "./claude-advice-format.ts";
import { spawnClaudeCli } from "./claude-cli.ts";
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

	let streamed = "";
	const result = await spawnClaudeCli({
		profile: "claude-advisor",
		task,
		cwd: ctx.cwd,
		model: args.model,
		tools: "read,grep,find,ls,bash",
		systemPrompt: "You are an advisor. Review the shared context and produce strategic guidance without taking over implementation.",
		contextPacket,
		onTextDelta: (delta) => {
			streamed += delta;
			onTextDelta?.(streamed);
		},
	});

	const normalized = normalizeAdvisorResponse(result.result || result.output || streamed);
	const text = [
		`Summary: ${normalized.summary}`,
		`Recommended decision: ${normalized.recommendation}`,
		normalized.risks.length ? `Risks:\n- ${normalized.risks.join("\n- ")}` : "",
		normalized.alternatives.length ? `Alternatives:\n- ${normalized.alternatives.join("\n- ")}` : "",
		normalized.nextActions.length ? `Next actions:\n- ${normalized.nextActions.join("\n- ")}` : "",
	].filter(Boolean).join("\n\n");

	return { normalized, text };
}
