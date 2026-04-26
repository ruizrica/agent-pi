// ABOUTME: On-demand Opus advisor tool powered by Claude Code CLI.
// ABOUTME: Builds a shared context packet and returns structured recommendations to the executor.

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { runAdvisor } from "./lib/claude-advisor-runner.ts";
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
			const { normalized, text } = await runAdvisor(args, ctx, (streamed) => {
				onUpdate?.({ content: [{ type: "text", text: streamed.slice(-4000) }] } as any);
			});

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
