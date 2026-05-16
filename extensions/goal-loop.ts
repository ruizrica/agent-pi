// ABOUTME: GOAL mode loop tools and terminal GOAL MET widget.
// ABOUTME: Mirrors complex-problem-loop state management for objective-driven loops until a success condition is met.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import {
	appendGoalMetMarkdown,
	bulletLines,
	ensureDir,
	goalInitialMarkdown,
	goalSessionPath,
	resolveGoalSessionName,
	setCurrentGoalSession,
	upsertGoalSection,
} from "./lib/goal-loop-session.ts";
import { GOAL_MET_BG, renderGoalMet, type GoalMetState } from "./lib/goal-met-render.ts";

const StartParams = Type.Object({
	goal: Type.String({ description: "Objective to pursue in GOAL mode" }),
	success_condition: Type.String({ description: "Observable condition that proves the goal is met" }),
	success_criteria: Type.Optional(Type.Array(Type.String(), { description: "Additional measurable success criteria" })),
	constraints: Type.Optional(Type.Array(Type.String(), { description: "Known constraints or boundaries" })),
	session_name: Type.Optional(Type.String({ description: "Optional stable session slug; defaults to a slug of the goal" })),
});

const AdvanceParams = Type.Object({
	next_slice: Type.String({ description: "The next focused loop slice" }),
	last_slice: Type.Optional(Type.String({ description: "What was just attempted or completed" })),
	progress: Type.Optional(Type.Array(Type.String(), { description: "Progress updates toward the success condition" })),
	current_understanding: Type.Optional(Type.Array(Type.String(), { description: "Facts or findings learned so far" })),
	evidence: Type.Optional(Type.Array(Type.String(), { description: "Evidence relevant to whether the condition is met" })),
	condition_status: Type.Optional(Type.String({ description: "Current evaluation of the success condition" })),
	open_questions: Type.Optional(Type.Array(Type.String(), { description: "Questions blocking progress or confidence" })),
	risks: Type.Optional(Type.Array(Type.String(), { description: "Current risks or concerns" })),
	session_name: Type.Optional(Type.String({ description: "Optional stable session slug; defaults to the current GOAL session" })),
});

const CompleteParams = Type.Object({
	goal: Type.String({ description: "Completed objective" }),
	success_condition: Type.String({ description: "Condition that has been met" }),
	evidence: Type.Optional(Type.Array(Type.String(), { description: "Evidence proving the goal is met" })),
	summary: Type.Optional(Type.String({ description: "Concise completion summary for the GOAL MET card" })),
	next_steps: Type.Optional(Type.Array(Type.String(), { description: "Optional follow-up actions after completion" })),
	iterations: Type.Optional(Type.Number({ description: "Optional number of loop iterations completed" })),
	session_name: Type.Optional(Type.String({ description: "Optional stable session slug; defaults to the current GOAL session or a slug of the goal" })),
});

function evidenceLines(items?: string[]): string {
	if (!items || items.length === 0) return "| None recorded | goal_loop_advance |";
	return items.map((item) => `| ${item.replace(/\|/g, "\\|")} | tool: goal_loop_advance |`).join("\n");
}

function showGoalMet(ctx: ExtensionContext, state: GoalMetState): void {
	if (!ctx.hasUI) return;

	const RESET_BG = "\x1b[49m";
	const WHITE_BOLD = "\x1b[1;97m";
	const RESET_ALL = "\x1b[0m";

	ctx.ui.setWidget("goal-met", (_tui: any, theme: any) => {
		const { Box, Text: TuiText } = require("@earendil-works/pi-tui");
		const bgFn = (text: string): string => `${GOAL_MET_BG}${WHITE_BOLD}${text}${RESET_ALL}${RESET_BG}`;
		const box = new Box(1, 1, bgFn);
		const content = new TuiText("", 0, 0);
		box.addChild(content);

		return {
			render(width: number): string[] {
				const result = renderGoalMet(state, width, theme);
				content.setText(result.lines.join("\n"));
				return box.render(width);
			},
			invalidate() {
				box.invalidate();
			},
		};
	});
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "goal_loop_start",
		label: "GOAL Loop Start",
		description: "Create a .context GOAL session scaffold for looping until a success condition is met",
		parameters: StartParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { goal, success_condition, success_criteria, constraints, session_name } = params as {
				goal: string;
				success_condition: string;
				success_criteria?: string[];
				constraints?: string[];
				session_name?: string;
			};
			const cwd = ctx.cwd || process.cwd();
			const resolvedSession = resolveGoalSessionName(cwd, session_name, goal);
			const filePath = goalSessionPath(cwd, resolvedSession);
			ensureDir(dirname(filePath));
			const content = goalInitialMarkdown({
				goal,
				successCondition: success_condition,
				successCriteria: success_criteria,
				constraints,
			});
			writeFileSync(filePath, content, "utf-8");
			setCurrentGoalSession(cwd, resolvedSession);
			if (ctx.hasUI) ctx.ui.setWidget("goal-met", undefined);
			return { content: [{ type: "text" as const, text: `Started GOAL session at ${filePath}` }] };
		},
	});

	pi.registerTool({
		name: "goal_loop_advance",
		label: "GOAL Loop Advance",
		description: "Update the current GOAL session with reflection, evidence, condition status, and next slice",
		parameters: AdvanceParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const {
				next_slice,
				last_slice,
				progress,
				current_understanding,
				evidence,
				condition_status,
				open_questions,
				risks,
				session_name,
			} = params as {
				next_slice: string;
				last_slice?: string;
				progress?: string[];
				current_understanding?: string[];
				evidence?: string[];
				condition_status?: string;
				open_questions?: string[];
				risks?: string[];
				session_name?: string;
			};
			const cwd = ctx.cwd || process.cwd();
			const resolvedSession = resolveGoalSessionName(cwd, session_name);
			const filePath = goalSessionPath(cwd, resolvedSession);
			ensureDir(dirname(filePath));
			const existing = existsSync(filePath)
				? readFileSync(filePath, "utf-8")
				: goalInitialMarkdown({ goal: "Unnamed GOAL session", successCondition: "Not recorded" });
			let updated = existing;
			if (progress) updated = upsertGoalSection(updated, "Current Progress", bulletLines(progress));
			if (current_understanding) updated = upsertGoalSection(updated, "Current Understanding", bulletLines(current_understanding));
			if (evidence) updated = upsertGoalSection(updated, "Evidence", `| Evidence | Source |\n|----------|--------|\n${evidenceLines(evidence)}`);
			if (condition_status) updated = upsertGoalSection(updated, "Condition Status", `- ${condition_status}`);
			if (open_questions) updated = upsertGoalSection(updated, "Open Questions", bulletLines(open_questions));
			if (risks) updated = upsertGoalSection(updated, "Risks", bulletLines(risks));
			if (last_slice) updated = upsertGoalSection(updated, "Last Slice", `- ${last_slice}`);
			updated = upsertGoalSection(updated, "Next Slice", `- ${next_slice}`);
			writeFileSync(filePath, updated, "utf-8");
			setCurrentGoalSession(cwd, resolvedSession);
			return { content: [{ type: "text" as const, text: `Updated GOAL session at ${filePath}` }] };
		},
	});

	pi.registerTool({
		name: "goal_loop_complete",
		label: "GOAL Loop Complete",
		description: "Mark a GOAL session complete and show the terminal GOAL MET widget",
		parameters: CompleteParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { goal, success_condition, evidence, summary, next_steps, iterations, session_name } = params as {
				goal: string;
				success_condition: string;
				evidence?: string[];
				summary?: string;
				next_steps?: string[];
				iterations?: number;
				session_name?: string;
			};
			const cwd = ctx.cwd || process.cwd();
			const resolvedSession = resolveGoalSessionName(cwd, session_name, goal);
			const filePath = goalSessionPath(cwd, resolvedSession);
			ensureDir(dirname(filePath));
			const existing = existsSync(filePath)
				? readFileSync(filePath, "utf-8")
				: goalInitialMarkdown({ goal, successCondition: success_condition });
			const updated = appendGoalMetMarkdown(existing, {
				goal,
				successCondition: success_condition,
				summary,
				evidence,
				nextSteps: next_steps,
			});
			writeFileSync(filePath, updated, "utf-8");
			setCurrentGoalSession(cwd, resolvedSession);
			showGoalMet(ctx, {
				goal,
				successCondition: success_condition,
				summary,
				evidence,
				nextSteps: next_steps,
				completedAt: Date.now(),
				iterations,
			});
			return { content: [{ type: "text" as const, text: `GOAL MET. Updated GOAL session at ${filePath}` }] };
		},
	});

	pi.registerCommand("goal-met-dismiss", {
		description: "Dismiss the GOAL MET terminal widget",
		handler: async (_args, ctx) => {
			if (ctx.hasUI) ctx.ui.setWidget("goal-met", undefined);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults(import.meta.url, ctx);
	});
}
