// ABOUTME: On-demand Opus advisor tool powered by Claude Code CLI.
// ABOUTME: Builds a shared context packet and returns structured recommendations to the executor.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { buildAdvisorPrompt, normalizeAdvisorResponse } from "./lib/claude-advice-format.ts";
import { spawnClaudeCli } from "./lib/claude-cli.ts";
import { buildClaudeContextPacket } from "./lib/claude-context.ts";
import { applyExtensionDefaults } from "./lib/themeMap.ts";

const Params = Type.Object({
	question: Type.String({ description: "Question or decision to ask the Opus advisor" }),
	task_context: Type.Optional(Type.String({ description: "Additional task context or summary to append" })),
	files: Type.Optional(Type.Array(Type.String({ description: "Relevant file paths to include as hints" }))),
	model: Type.Optional(Type.String({ description: "Optional model override for the advisor" })),
	agent_role: Type.Optional(Type.String({ description: "Role of the calling agent (e.g., scout, builder, reviewer, planner, tester, red-team)" })),
});

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "claude_advisor",
		label: "Claude Advisor",
		description: "Ask the Opus-backed Claude advisor to review shared context and return recommendations, risks, alternatives, and next actions.",
		parameters: Params,
		async execute(_toolCallId, args, _signal, onUpdate, ctx) {
			const question = args.question.trim();
			const role = args.agent_role?.trim();
			const task = [args.task_context?.trim(), buildAdvisorPrompt(question, role)].filter(Boolean).join("\n\n");

			// Include CLAUDE.md content for codex awareness when available (capped for size)
			let claudeDoc: string | undefined;
			try {
				const fs = await import("fs");
				const path = await import("path");
				const claudePath = path.join(ctx.cwd, "CLAUDE.md");
				if (fs.existsSync(claudePath)) {
					claudeDoc = fs.readFileSync(claudePath, "utf-8");
				}
			} catch {}

			const contextLines: string[] = [];
			if (claudeDoc) {
				contextLines.push("## Project Codex (CLAUDE.md)");
				contextLines.push(claudeDoc.slice(0, 8000)); // cap to avoid huge packets
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
					onUpdate?.({ content: [{ type: "text", text: streamed.slice(-4000) }] } as any);
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

			return {
				content: [{ type: "text", text }],
				details: normalized,
			};
		},
		renderCall(args, theme) {
			return new Text(`${theme.bold("claude_advisor")} ${theme.fg("muted", args.question || "")}`, 0, 0);
		},
		renderResult(result, _opts, _theme) {
			const text = result.content?.[0]?.type === "text" ? result.content[0].text : "";
			return new Text(text, 0, 0);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});
}
